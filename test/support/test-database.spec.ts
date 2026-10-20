import type { DataSource } from 'typeorm';
import {
  buildTestDatabaseOptions,
  initializeTestDatabase,
} from './test-database';

describe('test database connection guards (no database)', () => {
  const validEnv = () => ({
    NODE_ENV: 'test',
    RUN_DB_TESTS: '1',
    TEST_DB_HOST: '127.0.0.1',
    TEST_DB_PORT: '3308',
    TEST_DB_DATABASE: 'stockflow_test',
    TEST_DB_USERNAME: 'stockflow_test',
    TEST_DB_PASSWORD: 'unit-test-placeholder',
  });

  const makeConnection = () => {
    const connection = {
      isInitialized: false,
      initialize: jest.fn(),
      query: jest.fn().mockResolvedValue([
        {
          databaseName: 'stockflow_test',
          accountName: 'stockflow_test@%',
          timeZone: '+00:00',
        },
      ]),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    connection.initialize.mockImplementation(async () => {
      connection.isInitialized = true;
    });
    return connection;
  };

  it('builds isolated options with automatic writes disabled', () => {
    expect(buildTestDatabaseOptions(validEnv())).toMatchObject({
      type: 'mysql',
      host: '127.0.0.1',
      port: 3308,
      database: 'stockflow_test',
      username: 'stockflow_test',
      synchronize: false,
      dropSchema: false,
      migrationsRun: false,
      timezone: 'Z',
      logging: false,
      poolSize: 10,
    });
  });

  it.each([
    ['NODE_ENV', undefined],
    ['NODE_ENV', 'production'],
    ['NODE_ENV', 'development'],
    ['RUN_DB_TESTS', undefined],
    ['RUN_DB_TESTS', '0'],
    ['TEST_DB_HOST', undefined],
    ['TEST_DB_HOST', 'localhost'],
    ['TEST_DB_HOST', '192.0.2.1'],
    ['TEST_DB_PORT', undefined],
    ['TEST_DB_PORT', '3306'],
    ['TEST_DB_PORT', '3307'],
    ['TEST_DB_PORT', '3308abc'],
    ['TEST_DB_DATABASE', undefined],
    ['TEST_DB_DATABASE', 'stockflow'],
    ['TEST_DB_DATABASE', 'production_test'],
    ['TEST_DB_USERNAME', undefined],
    ['TEST_DB_USERNAME', 'root'],
    ['TEST_DB_PASSWORD', undefined],
    ['TEST_DB_PASSWORD', ''],
    ['TEST_DB_PASSWORD', '   '],
  ])('rejects %s=%s before constructing a connection', async (key, value) => {
    const create = jest.fn();
    await expect(
      initializeTestDatabase({ ...validEnv(), [key!]: value }, create),
    ).rejects.toThrow(/Test database setting/);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not fall back to development DB variables', async () => {
    const create = jest.fn();
    await expect(
      initializeTestDatabase(
        {
          NODE_ENV: 'test',
          RUN_DB_TESTS: '1',
          DB_HOST: '127.0.0.1',
          DB_PORT: '3308',
          DB_DATABASE: 'stockflow_test',
          DB_USERNAME: 'stockflow_test',
          DB_PASSWORD: 'unit-test-placeholder',
        },
        create,
      ),
    ).rejects.toThrow('TEST_DB_HOST');
    expect(create).not.toHaveBeenCalled();
  });

  it('only reads the connected target and leaves schema preparation explicit', async () => {
    const connection = makeConnection();
    const create = jest
      .fn()
      .mockReturnValue(connection as unknown as DataSource);
    await expect(initializeTestDatabase(validEnv(), create)).resolves.toBe(
      connection,
    );
    expect(connection.initialize).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledWith(
      'SELECT DATABASE() AS databaseName, CURRENT_USER() AS accountName, @@session.time_zone AS timeZone',
    );
    expect(connection.destroy).not.toHaveBeenCalled();
  });

  it.each([
    {
      databaseName: 'stockflow',
      accountName: 'stockflow_test@%',
      timeZone: '+00:00',
    },
    {
      databaseName: 'stockflow_test',
      accountName: 'root@localhost',
      timeZone: '+00:00',
    },
    {
      databaseName: 'stockflow_test',
      accountName: 'stockflow_test@%',
      timeZone: 'SYSTEM',
    },
    {
      databaseName: 'stockflow_test',
      accountName: 'stockflow_test@%',
      timeZone: '+09:00',
    },
  ])('closes a connection with an unexpected target: %j', async (target) => {
    const connection = makeConnection();
    connection.query.mockResolvedValue([target]);
    const create = jest
      .fn()
      .mockReturnValue(connection as unknown as DataSource);
    await expect(initializeTestDatabase(validEnv(), create)).rejects.toThrow(
      'Test database connection or target verification failed',
    );
    expect(connection.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty target result and closes the connection', async () => {
    const connection = makeConnection();
    connection.query.mockResolvedValue([]);
    const create = jest
      .fn()
      .mockReturnValue(connection as unknown as DataSource);
    await expect(initializeTestDatabase(validEnv(), create)).rejects.toThrow();
    expect(connection.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not expose a driver error or supplied password', async () => {
    const connection = makeConnection();
    const secret = 'unit-test-sensitive-value';
    connection.initialize.mockRejectedValue(new Error(secret));
    const create = jest
      .fn()
      .mockReturnValue(connection as unknown as DataSource);
    await expect(
      initializeTestDatabase(
        { ...validEnv(), TEST_DB_PASSWORD: secret },
        create,
      ),
    ).rejects.toThrow('Test database connection or target verification failed');
    expect(connection.query).not.toHaveBeenCalled();
    expect(connection.destroy).not.toHaveBeenCalled();
  });

  it('closes the connection when target inspection fails', async () => {
    const connection = makeConnection();
    connection.query.mockRejectedValue(new Error('unit-test-query-error'));
    const create = jest
      .fn()
      .mockReturnValue(connection as unknown as DataSource);
    await expect(initializeTestDatabase(validEnv(), create)).rejects.toThrow();
    expect(connection.destroy).toHaveBeenCalledTimes(1);
  });

  it('reports a cleanup failure without exposing driver details', async () => {
    const connection = makeConnection();
    connection.query.mockResolvedValue([]);
    connection.destroy.mockRejectedValue(
      new Error('unit-test-sensitive-value'),
    );
    const create = jest
      .fn()
      .mockReturnValue(connection as unknown as DataSource);
    await expect(initializeTestDatabase(validEnv(), create)).rejects.toThrow(
      'Test database verification failed; connection cleanup also failed',
    );
  });
});
