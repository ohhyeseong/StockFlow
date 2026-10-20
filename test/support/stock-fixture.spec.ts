import type { DataSource } from 'typeorm';
import { Item } from '../../src/items/entity/item.entity';
import { Stock } from '../../src/stock/entity/stock.entity';
import { StockLog } from '../../src/stock/entity/stock-log.entity';
import { User } from '../../src/users/entity/user.entity';
import {
  cleanupStockFixture,
  createStockFixture,
  prepareStockTestSchema,
} from './stock-fixture';
import type { StockFixture } from './stock-fixture';

describe('stock fixture safety (no database)', () => {
  const tables = () =>
    ['item', 'stock', 'stock_log', 'users'].map((tableName) => ({
      tableName,
      engine: 'InnoDB',
    }));
  const makeConnection = () => {
    const ids = new Map<unknown, number>([
      [User, 11],
      [Item, 22],
      [Stock, 33],
    ]);
    const names = new Map<unknown, string>([
      [User, 'users'],
      [Item, 'item'],
      [Stock, 'stock'],
      [StockLog, 'stock_log'],
    ]);
    const manager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (entity, data) => ({ ...data, id: ids.get(entity) })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const connection = {
      isInitialized: true,
      options: {
        type: 'mysql',
        host: '127.0.0.1',
        port: 3308,
        database: 'stockflow_test',
        username: 'stockflow_test',
        synchronize: false,
        dropSchema: false,
        migrationsRun: false,
      },
      getMetadata: jest.fn((entity) => ({ tableName: names.get(entity) })),
      query: jest.fn().mockResolvedValue(tables()),
      synchronize: jest.fn().mockResolvedValue(undefined),
      transaction: jest.fn(async (run) => run(manager)),
    };
    return {
      connection,
      manager,
      dataSource: connection as unknown as DataSource,
    };
  };
  const fixture = (): StockFixture => ({
    user: { id: 11 } as User,
    item: { id: 22 } as Item,
    stock: { id: 33 } as Stock,
  });

  it('creates required fields and initial stock within one transaction', async () => {
    const { connection, manager, dataSource } = makeConnection();
    const seeded = await createStockFixture(dataSource, 10);
    expect(connection.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save.mock.calls.map(([entity]) => entity)).toEqual([
      User,
      Item,
      Stock,
    ]);
    expect(seeded.user.email).toMatch(/^stock-test-.+@example\.invalid$/);
    expect(seeded.user.password).toMatch(/^\$2[ab]\$04\$/);
    expect(seeded.user.name).toBeTruthy();
    expect(seeded.item.code).toMatch(/^IT-/);
    expect(seeded.item.size).toBe('K');
    expect(seeded.stock.item).toBe(seeded.item);
    expect(seeded.stock.currentQuantity).toBe(10);
  });

  it('uses unique identifiers for independent fixtures', async () => {
    const { dataSource } = makeConnection();
    const first = await createStockFixture(dataSource);
    const second = await createStockFixture(dataSource);
    expect(first.user.email).not.toBe(second.user.email);
    expect(first.item.code).not.toBe(second.item.code);
  });

  it('propagates a seed failure without creating later rows', async () => {
    const { manager, dataSource } = makeConnection();
    manager.save.mockRejectedValueOnce(new Error('fixture-insert-failed'));
    await expect(createStockFixture(dataSource)).rejects.toThrow(
      'fixture-insert-failed',
    );
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it.each([-1, 1.5, Number.NaN])(
    'rejects unsafe initial quantity %s before writing',
    async (quantity) => {
      const { connection, dataSource } = makeConnection();
      await expect(createStockFixture(dataSource, quantity)).rejects.toThrow(
        'quantity',
      );
      expect(connection.transaction).not.toHaveBeenCalled();
    },
  );

  it('does nothing when no fixture was created', async () => {
    const { connection, dataSource } = makeConnection();
    await cleanupStockFixture(dataSource, undefined);
    expect(connection.transaction).not.toHaveBeenCalled();
  });

  it('deletes only the fixture IDs in foreign-key order within one transaction', async () => {
    const { connection, manager, dataSource } = makeConnection();
    await cleanupStockFixture(dataSource, fixture());
    expect(connection.transaction).toHaveBeenCalledTimes(1);
    expect(manager.delete.mock.calls).toEqual([
      [StockLog, [{ item: { id: 22 } }, { user: { id: 11 } }]],
      [Stock, { id: 33 }],
      [Item, { id: 22 }],
      [User, { id: 11 }],
    ]);
    expect(connection.query).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, undefined])(
    'refuses cleanup with missing/unsafe ID %s',
    async (id) => {
      const { connection, dataSource } = makeConnection();
      const seeded = fixture();
      seeded.item.id = id as number;
      await expect(cleanupStockFixture(dataSource, seeded)).rejects.toThrow(
        'exact positive fixture IDs',
      );
      expect(connection.transaction).not.toHaveBeenCalled();
    },
  );

  it('stops cleanup on failure and allows a retry with the same IDs', async () => {
    const { manager, dataSource } = makeConnection();
    const seeded = fixture();
    manager.delete.mockRejectedValueOnce(new Error('cleanup-failed'));
    await expect(cleanupStockFixture(dataSource, seeded)).rejects.toThrow(
      'cleanup-failed',
    );
    expect(manager.delete).toHaveBeenCalledTimes(1);
    manager.delete.mockClear();
    await cleanupStockFixture(dataSource, seeded);
    expect(manager.delete.mock.calls[0]).toEqual([
      StockLog,
      [{ item: { id: 22 } }, { user: { id: 11 } }],
    ]);
    expect(manager.delete).toHaveBeenCalledTimes(4);
  });

  it('rejects an unapproved connection before fixture writes or schema queries', async () => {
    const { connection, dataSource } = makeConnection();
    connection.options.database = 'stockflow';
    await expect(createStockFixture(dataSource)).rejects.toThrow(
      'verified test connection',
    );
    await expect(cleanupStockFixture(dataSource, fixture())).rejects.toThrow(
      'verified test connection',
    );
    await expect(prepareStockTestSchema(dataSource)).rejects.toThrow(
      'verified test connection',
    );
    expect(connection.transaction).not.toHaveBeenCalled();
    expect(connection.query).not.toHaveBeenCalled();
    expect(connection.synchronize).not.toHaveBeenCalled();
  });

  it('creates tables only when the schema is completely empty', async () => {
    const { connection, dataSource } = makeConnection();
    connection.query.mockResolvedValueOnce([]).mockResolvedValueOnce(tables());
    await prepareStockTestSchema(dataSource);
    expect(connection.synchronize).toHaveBeenCalledWith(false);
    expect(connection.query).toHaveBeenCalledTimes(2);
  });

  it('reuses existing expected InnoDB tables without synchronizing', async () => {
    const { connection, dataSource } = makeConnection();
    await prepareStockTestSchema(dataSource);
    expect(connection.synchronize).not.toHaveBeenCalled();
  });

  it.each([
    [{ tableName: 'unrelated_table', engine: 'InnoDB' }],
    tables().slice(0, 3),
    tables().map((table) => ({ ...table, engine: 'MyISAM' })),
  ])(
    'rejects unexpected existing tables/engines without changing them: %j',
    async (...rows) => {
      const { connection, dataSource } = makeConnection();
      connection.query.mockResolvedValue(rows);
      await expect(prepareStockTestSchema(dataSource)).rejects.toThrow(
        'expected InnoDB tables',
      );
      expect(connection.synchronize).not.toHaveBeenCalled();
    },
  );
});
