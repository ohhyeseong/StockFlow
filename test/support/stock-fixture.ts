import { randomUUID } from 'node:crypto';
import { hash } from 'bcrypt';
import type { DataSource } from 'typeorm';
import { Item, MattressSize } from '../../src/items/entity/item.entity';
import { Stock } from '../../src/stock/entity/stock.entity';
import { StockLog } from '../../src/stock/entity/stock-log.entity';
import { User } from '../../src/users/entity/user.entity';

export interface StockFixture {
  user: User;
  item: Item;
  stock: Stock;
}

function assertTestConnection(dataSource: DataSource): void {
  const options = dataSource.options;
  if (
    !dataSource.isInitialized ||
    options.type !== 'mysql' ||
    options.host !== '127.0.0.1' ||
    options.port !== 3308 ||
    options.database !== 'stockflow_test' ||
    options.username !== 'stockflow_test' ||
    options.synchronize !== false ||
    options.dropSchema !== false ||
    options.migrationsRun !== false
  ) {
    throw new Error('Fixture operations require the verified test connection');
  }
}

// Only a completely empty test schema may be created. Existing tables are never synchronized.
export async function prepareStockTestSchema(
  dataSource: DataSource,
): Promise<void> {
  assertTestConnection(dataSource);
  const expected = [Item, Stock, StockLog, User]
    .map((entity) => dataSource.getMetadata(entity).tableName)
    .sort();
  const inspect = (): Promise<
    Array<{ tableName: string; engine: string | null }>
  > =>
    dataSource.query(
      'SELECT TABLE_NAME AS tableName, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
    );
  let tables = await inspect();
  if (tables.length === 0) {
    await dataSource.synchronize(false);
    tables = await inspect();
  }
  const actual = tables.map((table) => table.tableName).sort();
  if (
    actual.length !== expected.length ||
    actual.some((name, index) => name !== expected[index]) ||
    tables.some((table) => table.engine !== 'InnoDB')
  ) {
    throw new Error(
      'Test schema must contain exactly the expected InnoDB tables; no existing schema was altered',
    );
  }
}

export async function createStockFixture(
  dataSource: DataSource,
  initialQuantity = 10,
): Promise<StockFixture> {
  assertTestConnection(dataSource);
  if (!Number.isSafeInteger(initialQuantity) || initialQuantity < 0) {
    throw new Error('Fixture quantity must be a nonnegative safe integer');
  }
  const token = randomUUID();
  // Disposable fixture credential, unrelated to application users or login tests.
  const password = await hash(randomUUID(), 4);
  return dataSource.transaction(async (manager) => {
    const user = await manager.save(
      User,
      manager.create(User, {
        email: `stock-test-${token}@example.invalid`,
        password,
        name: 'Stock integration fixture',
      }),
    );
    const item = await manager.save(
      Item,
      manager.create(Item, {
        code: `IT-${token}`,
        name: 'Integration mattress',
        size: MattressSize.K,
        minStockQuantity: 2,
      }),
    );
    const stock = await manager.save(
      Stock,
      manager.create(Stock, {
        item,
        currentQuantity: initialQuantity,
      }),
    );
    return { user, item, stock };
  });
}

export async function cleanupStockFixture(
  dataSource: DataSource,
  fixture: StockFixture | undefined,
): Promise<void> {
  if (!fixture) return;
  assertTestConnection(dataSource);
  const { user, item, stock } = fixture;
  if (
    ![user.id, item.id, stock.id].every(
      (id) => Number.isSafeInteger(id) && id > 0,
    )
  ) {
    throw new Error('Refusing cleanup without exact positive fixture IDs');
  }
  await dataSource.transaction(async (manager) => {
    await manager.delete(StockLog, [
      { item: { id: item.id } },
      { user: { id: user.id } },
    ]);
    await manager.delete(Stock, { id: stock.id });
    await manager.delete(Item, { id: item.id });
    await manager.delete(User, { id: user.id });
  });
}
