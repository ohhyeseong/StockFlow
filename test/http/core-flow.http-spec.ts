import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import request = require('supertest');
import { Item } from '../../src/items/entity/item.entity';
import { User } from '../../src/users/entity/user.entity';
import { Stock } from '../../src/stock/entity/stock.entity';
import { StockLog } from '../../src/stock/entity/stock-log.entity';
import { initializeTestDatabase } from '../support/test-database';
import { prepareStockTestSchema } from '../support/stock-fixture';
import {
  buildHttpAppEnvironment,
  verifyHttpAppDatabase,
} from '../support/http-test-environment';

interface OwnedData {
  email: string;
  code: string;
}

describe('Core HTTP flow with the real AppModule and isolated MySQL', () => {
  let inspector: DataSource | undefined;
  let app: INestApplication | undefined;
  let baseUrl: string;
  let originalEnv: Record<string, string | undefined> | undefined;
  let beforeCounts: Record<string, number> | undefined;
  let afterCounts: Record<string, number> | undefined;
  let runtime: unknown;
  let email: string;
  let password: string;
  let itemId: number;
  let bearer: string;
  const pending = new Set<OwnedData>();

  const counts = async () => ({
    item: await inspector!.getRepository(Item).count(),
    stock: await inspector!.getRepository(Stock).count(),
    stock_log: await inspector!.getRepository(StockLog).count(),
    users: await inspector!.getRepository(User).count(),
  });

  const cleanup = async () => {
    if (!inspector?.isInitialized) return;
    for (const owned of pending) {
      await inspector.transaction(async (manager) => {
        // Names are registered before HTTP writes, so failed response assertions
        // cannot lose ownership information. All DELETEs use the resolved exact IDs.
        const user = await manager.findOneBy(User, { email: owned.email });
        const item = await manager.findOneBy(Item, { code: owned.code });
        const filters: Array<
          { item: { id: number } } | { user: { id: number } }
        > = [];
        if (item) filters.push({ item: { id: item.id } });
        if (user) filters.push({ user: { id: user.id } });
        if (filters.length) await manager.delete(StockLog, filters);
        if (item) {
          await manager.delete(Stock, { item: { id: item.id } });
          await manager.delete(Item, { id: item.id });
        }
        if (user) await manager.delete(User, { id: user.id });
      });
      pending.delete(owned);
    }
  };

  beforeAll(async () => {
    const appEnv = buildHttpAppEnvironment(process.env); // Validate before any connection/import.
    if (existsSync(resolve(__dirname, '../../.env'))) {
      throw new Error(
        'HTTP tests refuse a worktree .env; use the explicit test file',
      );
    }
    inspector = await initializeTestDatabase(process.env);
    await prepareStockTestSchema(inspector);
    beforeCounts = await counts();
    runtime = await inspector.query(
      'SELECT VERSION() AS version, @@transaction_isolation AS isolationLevel, @@session.time_zone AS timeZone',
    );
    originalEnv = {};
    for (const [key, value] of Object.entries(appEnv)) {
      originalEnv[key] = process.env[key];
      process.env[key] = value;
    }
    // No top-level AppModule import: its configuration reads only the guarded env.
    const { AppModule } = await import('../../src/app.module');
    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    await verifyHttpAppDatabase(app.get(DataSource));
    // Match main.ts input validation and entity serialization, without changing it.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(async () => {
    const id = randomUUID();
    email = 'http-' + id + '@example.com';
    password = randomBytes(24).toString('hex');
    const owned = { email, code: 'HTTP-' + id };
    pending.add(owned);
    const signup = await request(baseUrl)
      .post('/auth/signup')
      .send({ email, password, name: 'HTTP fixture' })
      .expect(201);
    expect(Number.isSafeInteger(signup.body.id)).toBe(true);
    expect('password' in signup.body).toBe(false);
    const login = await request(baseUrl)
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    expect(typeof login.body.accessToken).toBe('string');
    bearer = 'Bearer ' + login.body.accessToken;
    const item = await request(baseUrl)
      .post('/items')
      .set('Authorization', bearer)
      .send({
        code: owned.code,
        name: 'HTTP mattress',
        size: 'K',
        minStockQuantity: 2,
      })
      .expect(201);
    expect(Number.isSafeInteger(item.body.id)).toBe(true);
    itemId = item.body.id;
  });

  afterEach(cleanup);

  afterAll(async () => {
    try {
      await cleanup();
      if (beforeCounts) {
        afterCounts = await counts();
        expect(afterCounts).toEqual(beforeCounts);
      }
    } finally {
      try {
        if (app) await app.close();
      } finally {
        try {
          if (inspector?.isInitialized) await inspector.destroy();
        } finally {
          if (originalEnv) {
            for (const [key, value] of Object.entries(originalEnv)) {
              if (value === undefined) delete process.env[key];
              else process.env[key] = value;
            }
          }
          if (process.env.HTTP_TEST_REPORT_PATH) {
            writeFileSync(
              process.env.HTTP_TEST_REPORT_PATH,
              JSON.stringify(
                {
                  target: {
                    host: '127.0.0.1',
                    port: 3308,
                    database: 'stockflow_test',
                    account: 'stockflow_test',
                  },
                  runtime,
                  beforeCounts,
                  afterCounts,
                  pendingOwnedData: pending.size,
                  listenerClosed: app ? !app.getHttpServer().listening : true,
                  limitation:
                    'Real AppModule HTTP; main.ts bootstrap and Swagger are not executed.',
                },
                null,
                2,
              ),
              { encoding: 'utf8', flag: 'wx' },
            );
          }
        }
      }
    }
  });

  const api = () => request(baseUrl);
  const stock = () =>
    api()
      .get('/stock/' + itemId)
      .set('Authorization', bearer)
      .expect(200);
  const logs = () =>
    api()
      .get('/stock/logs')
      .query({ itemId })
      .set('Authorization', bearer)
      .expect(200);
  const inbound = (quantity: number) =>
    api()
      .post('/stock/in')
      .set('Authorization', bearer)
      .send({ itemId, quantity });
  const outbound = (quantity: number) =>
    api()
      .post('/stock/out')
      .set('Authorization', bearer)
      .send({ itemId, quantity });

  it('registers, logs in, creates zero stock, and persists 10 in / 3 out with private user data excluded', async () => {
    expect((await stock()).body.currentQuantity).toBe(0);
    expect((await inbound(10).expect(201)).body.currentQuantity).toBe(10);
    const out = await outbound(3).expect(201);
    expect(out.body.currentQuantity).toBe(7);
    expect(out.body.lowStockWarning).toBe(false);
    expect((await stock()).body.currentQuantity).toBe(7);
    const history = (await logs()).body;
    expect(history).toHaveLength(2);
    expect(
      history
        .map((row: any) => [row.type, row.quantity, row.stockAfter])
        .sort(),
    ).toEqual([
      ['IN', 10, 10],
      ['OUT', 3, 7],
    ]);
    for (const row of history) {
      expect(row.user.email).toBe(email);
      expect('password' in row.user).toBe(false);
      expect(JSON.stringify(row).includes(password)).toBe(false);
    }
  });

  it('rejects a duplicate signup with 409 and keeps one owned user', async () => {
    await api()
      .post('/auth/signup')
      .send({ email, password, name: 'Duplicate' })
      .expect(409);
    expect(await inspector!.getRepository(User).countBy({ email })).toBe(1);
  });

  it('rejects a wrong password with 401', async () => {
    await api()
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects an unknown login with 401', async () => {
    await api()
      .post('/auth/login')
      .send({ email: 'missing-' + randomUUID() + '@example.com', password })
      .expect(401);
  });

  it('rejects invalid signup input without persisting it', async () => {
    const id = randomUUID();
    const invalidEmail = 'invalid-email-' + id;
    // Also own the attempted invalid identity in case a validation regression persists it.
    pending.add({ email: invalidEmail, code: 'HTTP-unused-' + id });
    await api()
      .post('/auth/signup')
      .send({ email: invalidEmail, password: 'short', name: 'Invalid' })
      .expect(400);
    expect(
      await inspector!.getRepository(User).countBy({ email: invalidEmail }),
    ).toBe(0);
  });

  it.each(['/items', '/stock', '/stock/logs'])(
    'rejects an absent token on %s',
    async (route) => {
      await api().get(route).expect(401);
    },
  );

  it('rejects a malformed JWT on a write and leaves stock unchanged', async () => {
    await api()
      .post('/stock/in')
      .set('Authorization', 'Bearer invalid-token')
      .send({ itemId, quantity: 1 })
      .expect(401);
    expect((await stock()).body.currentQuantity).toBe(0);
    expect((await logs()).body).toHaveLength(0);
  });

  it('lists, retrieves, updates and deletes only the owned item with cascading stock removal', async () => {
    const items = await api()
      .get('/items')
      .set('Authorization', bearer)
      .expect(200);
    expect(items.body.some((row: any) => row.id === itemId)).toBe(true);
    await api()
      .get('/items/' + itemId)
      .set('Authorization', bearer)
      .expect(200);
    const patch = await api()
      .patch('/items/' + itemId)
      .set('Authorization', bearer)
      .send({ name: 'Updated mattress', minStockQuantity: 4 })
      .expect(200);
    expect(patch.body.name).toBe('Updated mattress');
    expect(patch.body.minStockQuantity).toBe(4);
    await api()
      .delete('/items/' + itemId)
      .set('Authorization', bearer)
      .expect(200);
    await api()
      .get('/items/' + itemId)
      .set('Authorization', bearer)
      .expect(404);
    await api()
      .get('/stock/' + itemId)
      .set('Authorization', bearer)
      .expect(404);
  });

  it('rejects a duplicate item code with 409 without creating extra stock', async () => {
    const item = await inspector!
      .getRepository(Item)
      .findOneByOrFail({ id: itemId });
    await api()
      .post('/items')
      .set('Authorization', bearer)
      .send({
        code: item.code,
        name: 'Duplicate',
        size: 'K',
        minStockQuantity: 2,
      })
      .expect(409);
    expect(
      await inspector!.getRepository(Stock).countBy({ item: { id: itemId } }),
    ).toBe(1);
  });

  it('rejects insufficient stock with 400 and leaves quantity and history unchanged', async () => {
    await inbound(10).expect(201);
    await outbound(11).expect(400);
    expect((await stock()).body.currentQuantity).toBe(10);
    expect((await logs()).body).toHaveLength(1);
  });

  it('returns a low stock warning at the configured threshold', async () => {
    await inbound(3).expect(201);
    const result = await outbound(1).expect(201);
    expect(result.body.currentQuantity).toBe(2);
    expect(result.body.lowStockWarning).toBe(true);
  });

  it.each([0, -1, 1.5, '1'])(
    'rejects invalid quantities %j for both in and out',
    async (quantity) => {
      for (const route of ['/stock/in', '/stock/out']) {
        await api()
          .post(route)
          .set('Authorization', bearer)
          .send({ itemId, quantity })
          .expect(400);
      }
      expect((await stock()).body.currentQuantity).toBe(0);
      expect((await logs()).body).toHaveLength(0);
    },
  );

  it('returns 404 for absent item operations without creating history', async () => {
    // The item was created through HTTP, then removed by its exact owned ID.
    await api()
      .delete('/items/' + itemId)
      .set('Authorization', bearer)
      .expect(200);
    for (const route of ['/stock/in', '/stock/out']) {
      await api()
        .post(route)
        .set('Authorization', bearer)
        .send({ itemId, quantity: 1 })
        .expect(404);
    }
    expect((await logs()).body).toHaveLength(0);
  });

  it('rejects a non-integer path parameter with 400', async () => {
    await api()
      .get('/stock/not-a-number')
      .set('Authorization', bearer)
      .expect(400);
  });

  it.each([
    { startDate: '2026-02-30' },
    { endDate: '2026-10-20T00:00:00Z' },
    { startDate: '2026-10-21', endDate: '2026-10-20' },
    { itemId: 'not-an-integer' },
  ])('rejects invalid history filters %j with 400', async (query) => {
    await api()
      .get('/stock/logs')
      .query(query)
      .set('Authorization', bearer)
      .expect(400);
  });

  it('includes KST start midnight and end-day last second, and excludes both outside boundaries', async () => {
    for (let index = 0; index < 4; index++) await inbound(1).expect(201);
    const ownedLogs = await inspector!.getRepository(StockLog).find({
      where: { item: { id: itemId } },
      order: { id: 'ASC' },
    });
    expect(ownedLogs).toHaveLength(4);
    const timestamps = [
      '2026-10-19T14:59:59.000Z',
      '2026-10-19T15:00:00.000Z',
      '2026-10-20T14:59:59.000Z',
      '2026-10-20T15:00:00.000Z',
    ];
    for (let index = 0; index < 4; index++) {
      await inspector!
        .getRepository(StockLog)
        .update(
          { id: ownedLogs[index].id },
          { createdAt: new Date(timestamps[index]) },
        );
    }
    const result = await api()
      .get('/stock/logs')
      .query({ itemId, startDate: '2026-10-20', endDate: '2026-10-20' })
      .set('Authorization', bearer)
      .expect(200);
    expect(
      result.body
        .map((row: any) => row.id)
        .sort((a: number, b: number) => a - b),
    ).toEqual([ownedLogs[1].id, ownedLogs[2].id]);
    const startOnly = await api()
      .get('/stock/logs')
      .query({ itemId, startDate: '2026-10-20' })
      .set('Authorization', bearer)
      .expect(200);
    expect(startOnly.body).toHaveLength(3);
    const endOnly = await api()
      .get('/stock/logs')
      .query({ itemId, endDate: '2026-10-20' })
      .set('Authorization', bearer)
      .expect(200);
    expect(endOnly.body).toHaveLength(3);
    expect((await logs()).body).toHaveLength(4);
  });
});
