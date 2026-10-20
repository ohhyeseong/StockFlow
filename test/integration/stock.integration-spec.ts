import { BadRequestException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import type { QueryRunner } from 'typeorm';
import { StockService } from '../../src/stock/service/stock.service';
import { Stock } from '../../src/stock/entity/stock.entity';
import {
  StockLog,
  StockLogType,
} from '../../src/stock/entity/stock-log.entity';
import { User } from '../../src/users/entity/user.entity';
import { initializeTestDatabase } from '../support/test-database';
import {
  cleanupStockFixture,
  createStockFixture,
  prepareStockTestSchema,
} from '../support/stock-fixture';
import type { StockFixture } from '../support/stock-fixture';

// This file is integration-only. Import/discovery never connects; beforeAll does.
// Loading a private env file and running this suite require separate approval.
describe('StockService real MySQL transactions', () => {
  let dataSource: DataSource | undefined;
  let service: StockService;
  let fixture: StockFixture;
  const pendingCleanup: StockFixture[] = [];

  const cleanupPending = async () => {
    if (!dataSource?.isInitialized) return;
    while (pendingCleanup.length) {
      await cleanupStockFixture(
        dataSource,
        pendingCleanup[pendingCleanup.length - 1],
      );
      pendingCleanup.pop();
    }
  };

  beforeAll(async () => {
    dataSource = await initializeTestDatabase(process.env);
    await prepareStockTestSchema(dataSource);
    service = new StockService(
      dataSource.getRepository(Stock),
      dataSource.getRepository(StockLog),
      dataSource,
    );
  });

  beforeEach(async () => {
    fixture = await createStockFixture(dataSource!, 10);
    pendingCleanup.push(fixture);
  });

  afterEach(cleanupPending);

  afterAll(async () => {
    try {
      await cleanupPending();
    } finally {
      if (dataSource?.isInitialized) await dataSource.destroy();
    }
  });

  const currentStock = () =>
    dataSource!.getRepository(Stock).findOneByOrFail({ id: fixture.stock.id });
  const itemLogs = () =>
    dataSource!.getRepository(StockLog).find({
      where: { item: { id: fixture.item.id } },
      order: { id: 'ASC' },
    });

  it('allows exactly 10 of 20 overlapping one-unit stock-out requests', async () => {
    const runners = new Set<QueryRunner>();
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    let opened = false;
    let confirmedOverlap = false;
    const release = (overlap: boolean) => {
      if (!opened) {
        opened = true;
        confirmedOverlap = overlap;
        open();
      }
    };
    // A bounded fallback avoids leaving transactions blocked on a failed barrier.
    const timeout = setTimeout(() => release(false), 5000);
    const originalCreate = dataSource!.createQueryRunner.bind(dataSource);
    const spy = jest
      .spyOn(dataSource!, 'createQueryRunner')
      .mockImplementation((mode) => {
        const runner = originalCreate(mode);
        const begin = runner.startTransaction.bind(runner);
        runner.startTransaction = async (isolationLevel) => {
          await begin(isolationLevel);
          if (!opened) {
            runners.add(runner);
            if (runners.size >= 2) release(true);
          }
          await gate;
        };
        return runner;
      });
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          service.stockOut(
            { itemId: fixture.item.id, quantity: 1 },
            fixture.user.id,
          ),
        ),
      );
      expect(confirmedOverlap).toBe(true);
      const succeeded = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const failed = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      expect(succeeded).toHaveLength(10);
      expect(failed).toHaveLength(10);
      for (const result of failed)
        expect(result.reason).toBeInstanceOf(BadRequestException);
      expect((await currentStock()).currentQuantity).toBe(0);
      const logs = await itemLogs();
      expect(logs).toHaveLength(10);
      expect(
        logs.every(
          (log) => log.type === StockLogType.OUT && log.quantity === 1,
        ),
      ).toBe(true);
      expect(logs.map((log) => log.stockAfter).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 10 }, (_, index) => index),
      );
    } finally {
      release(false);
      clearTimeout(timeout);
      spy.mockRestore();
    }
  });

  it('leaves stock and logs unchanged when requested quantity exceeds stock', async () => {
    await expect(
      service.stockOut(
        { itemId: fixture.item.id, quantity: 11 },
        fixture.user.id,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((await currentStock()).currentQuantity).toBe(10);
    expect(await itemLogs()).toHaveLength(0);
  });

  it.each(['in', 'out'] as const)(
    'rolls back stock-%s when the history insert violates a foreign key',
    async (direction) => {
      // Delete only this fixture user so the actual log INSERT fails after the stock UPDATE.
      await dataSource!.getRepository(User).delete({ id: fixture.user.id });
      const request = { itemId: fixture.item.id, quantity: 1 };
      const operation =
        direction === 'in'
          ? service.stockIn(request, fixture.user.id)
          : service.stockOut(request, fixture.user.id);
      const error: unknown = await operation.catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(QueryFailedError);
      expect(
        ((error as QueryFailedError).driverError as { code?: string }).code,
      ).toBe('ER_NO_REFERENCED_ROW_2');
      expect((await currentStock()).currentQuantity).toBe(10);
      expect(await itemLogs()).toHaveLength(0);
    },
  );
});
