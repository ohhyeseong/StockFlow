import { DataSource, type DataSourceOptions } from 'typeorm';
import { Item } from '../../src/items/entity/item.entity';
import { Stock } from '../../src/stock/entity/stock.entity';
import { StockLog } from '../../src/stock/entity/stock-log.entity';
import { User } from '../../src/users/entity/user.entity';

type TestEnvironment = Record<string, string | undefined>;
type TestDatabaseOptions = DataSourceOptions & { type: 'mysql' };
type DataSourceFactory = (options: TestDatabaseOptions) => DataSource;

// No .env loading and no development DB_* fallback: callers supply test settings.
export function buildTestDatabaseOptions(
  env: TestEnvironment,
): TestDatabaseOptions {
  const required = {
    NODE_ENV: 'test',
    RUN_DB_TESTS: '1',
    TEST_DB_HOST: '127.0.0.1',
    TEST_DB_PORT: '3308',
    TEST_DB_DATABASE: 'stockflow_test',
    TEST_DB_USERNAME: 'stockflow_test',
  };
  for (const [key, expected] of Object.entries(required)) {
    if (env[key] !== expected) {
      throw new Error(`Test database setting rejected: ${key}`);
    }
  }
  if (!env.TEST_DB_PASSWORD?.trim()) {
    throw new Error('Test database setting required: TEST_DB_PASSWORD');
  }

  return {
    type: 'mysql',
    host: '127.0.0.1',
    port: 3308,
    database: 'stockflow_test',
    username: 'stockflow_test',
    password: env.TEST_DB_PASSWORD,
    entities: [Item, Stock, StockLog, User],
    synchronize: false,
    dropSchema: false,
    migrationsRun: false,
    timezone: 'Z',
    logging: false,
    poolSize: 10,
  };
}

// Construction/import alone never connects. No schema or data changes here.
export async function initializeTestDatabase(
  env: TestEnvironment,
  createDataSource: DataSourceFactory = (options) => new DataSource(options),
): Promise<DataSource> {
  const options = buildTestDatabaseOptions(env);
  const dataSource = createDataSource(options);

  try {
    await dataSource.initialize();
    const rows: Array<{
      databaseName: string;
      accountName: string;
      timeZone: string;
    }> = await dataSource.query(
      'SELECT DATABASE() AS databaseName, CURRENT_USER() AS accountName, @@session.time_zone AS timeZone',
    );
    const target = rows[0];
    if (
      !target ||
      target.databaseName !== 'stockflow_test' ||
      target.accountName?.split('@')[0] !== 'stockflow_test' ||
      target.timeZone !== '+00:00'
    ) {
      throw new Error('Unexpected test database target');
    }
    return dataSource;
  } catch {
    if (dataSource.isInitialized) {
      try {
        await dataSource.destroy();
      } catch {
        throw new Error(
          'Test database verification failed; connection cleanup also failed',
        );
      }
    }
    // Do not include connection options, environment values, or driver errors.
    throw new Error('Test database connection or target verification failed');
  }
}
