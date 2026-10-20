import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { buildTestDatabaseOptions } from './test-database';

// Validate the TEST_DB_* allowlist before mapping anything to the real AppModule.
// NODE_ENV=production only disables schema synchronization; the DB stays isolated.
export function buildHttpAppEnvironment(
  env: Record<string, string | undefined>,
): Record<string, string> {
  if (env.RUN_HTTP_TESTS !== '1') {
    throw new Error('HTTP tests require RUN_HTTP_TESTS=1');
  }
  const options = buildTestDatabaseOptions(env);
  return {
    NODE_ENV: 'production',
    DB_HOST: options.host!,
    DB_PORT: String(options.port),
    DB_USERNAME: options.username!,
    DB_PASSWORD: options.password!,
    DB_DATABASE: options.database as string,
    JWT_SECRET: randomBytes(32).toString('hex'),
    JWT_EXPIRES_IN: '300',
  };
}

export async function verifyHttpAppDatabase(
  dataSource: DataSource,
): Promise<void> {
  const options = dataSource.options;
  if (
    !dataSource.isInitialized ||
    options.type !== 'mysql' ||
    options.host !== '127.0.0.1' ||
    options.port !== 3308 ||
    options.username !== 'stockflow_test' ||
    options.database !== 'stockflow_test' ||
    options.synchronize !== false ||
    options.dropSchema === true ||
    options.migrationsRun === true
  ) {
    throw new Error('HTTP app database options rejected');
  }
  const [target] = await dataSource.query(
    'SELECT DATABASE() AS databaseName, CURRENT_USER() AS accountName, @@session.time_zone AS timeZone',
  );
  if (
    target?.databaseName !== 'stockflow_test' ||
    target?.accountName?.split('@')[0] !== 'stockflow_test' ||
    target?.timeZone !== '+00:00'
  ) {
    throw new Error('HTTP app database identity rejected');
  }
}
