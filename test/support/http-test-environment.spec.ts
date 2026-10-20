import type { DataSource } from 'typeorm';
import {
  buildHttpAppEnvironment,
  verifyHttpAppDatabase,
} from './http-test-environment';

const approved = () => ({
  NODE_ENV: 'test',
  RUN_DB_TESTS: '1',
  RUN_HTTP_TESTS: '1',
  TEST_DB_HOST: '127.0.0.1',
  TEST_DB_PORT: '3308',
  TEST_DB_DATABASE: 'stockflow_test',
  TEST_DB_USERNAME: 'stockflow_test',
  TEST_DB_PASSWORD: 'unit-only-placeholder',
});

describe('HTTP test environment isolation (no database)', () => {
  it('ignores inherited development connection and JWT settings', () => {
    const result = buildHttpAppEnvironment({
      ...approved(),
      DB_HOST: 'other-host',
      DB_PORT: '3307',
      DB_DATABASE: 'development',
      DB_PASSWORD: 'unrelated',
      JWT_SECRET: 'inherited-key',
      TEST_DB_ROOT_PASSWORD: 'root-placeholder',
    });
    expect(result.DB_HOST).toBe('127.0.0.1');
    expect(result.DB_PORT).toBe('3308');
    expect(result.DB_DATABASE).toBe('stockflow_test');
    expect(result.DB_PASSWORD).toBe(approved().TEST_DB_PASSWORD);
    expect(result.NODE_ENV).toBe('production');
    expect(result.JWT_SECRET === 'inherited-key').toBe(false);
    expect('TEST_DB_ROOT_PASSWORD' in result).toBe(false);
  });

  it.each([
    ['RUN_HTTP_TESTS', '0'],
    ['RUN_DB_TESTS', '0'],
    ['NODE_ENV', 'production'],
    ['TEST_DB_HOST', 'localhost'],
    ['TEST_DB_PORT', '3307'],
    ['TEST_DB_DATABASE', 'development'],
    ['TEST_DB_USERNAME', 'root'],
    ['TEST_DB_PASSWORD', ''],
  ])(
    'rejects unsafe %s before constructing the app environment',
    (key, value) => {
      expect(() =>
        buildHttpAppEnvironment({ ...approved(), [key]: value }),
      ).toThrow();
    },
  );

  it('generates a fresh short-lived JWT key per invocation', () => {
    const first = buildHttpAppEnvironment(approved());
    const second = buildHttpAppEnvironment(approved());
    expect(first.JWT_SECRET === second.JWT_SECRET).toBe(false);
    expect(first.JWT_SECRET.length).toBe(64);
    expect(first.JWT_EXPIRES_IN).toBe('300');
  });

  const connection = () => ({
    isInitialized: true,
    options: {
      type: 'mysql',
      host: '127.0.0.1',
      port: 3308,
      database: 'stockflow_test',
      username: 'stockflow_test',
      synchronize: false,
    },
    query: jest.fn().mockResolvedValue([
      {
        databaseName: 'stockflow_test',
        accountName: 'stockflow_test@%',
        timeZone: '+00:00',
      },
    ]),
  });

  it.each([
    { port: 3307 },
    { synchronize: true },
    { dropSchema: true },
    { migrationsRun: true },
    { database: 'development' },
  ])(
    'rejects unsafe actual app options without an identity query: %j',
    async (override) => {
      const source = connection();
      Object.assign(source.options, override);
      await expect(
        verifyHttpAppDatabase(source as unknown as DataSource),
      ).rejects.toThrow();
      expect(source.query).not.toHaveBeenCalled();
    },
  );

  it('rejects a mismatched actual database identity', async () => {
    const source = connection();
    source.query.mockResolvedValue([{ databaseName: 'development' }]);
    await expect(
      verifyHttpAppDatabase(source as unknown as DataSource),
    ).rejects.toThrow();
  });

  it('accepts only the verified actual app connection', async () => {
    const source = connection();
    await expect(
      verifyHttpAppDatabase(source as unknown as DataSource),
    ).resolves.toBeUndefined();
  });
});
