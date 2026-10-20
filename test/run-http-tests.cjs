const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};

function prepare() {
  const envFile = value('--env-file');
  const reportDir = value('--report-dir');
  if (!args.includes('--allow-db-tests') || !envFile || !reportDir) {
    throw new Error(
      'Use --allow-db-tests --env-file .env.test.local --report-dir .tmp/<new-directory>',
    );
  }
  const target = path.resolve(root, reportDir);
  if (!target.startsWith(path.join(root, '.tmp') + path.sep)) {
    throw new Error('Reports must use a new directory under .tmp');
  }
  const settings = parseEnv(
    fs.readFileSync(path.resolve(root, envFile), 'utf8'),
  );
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      /^(DB_|TEST_DB_|JWT_|RUN_DB_TESTS$|RUN_HTTP_TESTS$|NODE_ENV$|NODE_OPTIONS$)/i.test(
        key,
      )
    ) {
      delete env[key];
    }
  }
  for (const key of [
    'TEST_DB_HOST',
    'TEST_DB_PORT',
    'TEST_DB_DATABASE',
    'TEST_DB_USERNAME',
    'TEST_DB_PASSWORD',
  ]) {
    if (settings[key] !== undefined) env[key] = settings[key];
  }
  Object.assign(env, {
    NODE_ENV: 'test',
    RUN_DB_TESTS: '1',
    RUN_HTTP_TESTS: '1',
  });
  fs.mkdirSync(target); // Refuse to overwrite an earlier verification directory.
  env.HTTP_TEST_REPORT_PATH = path.join(target, 'database-report.json');
  const resultPath = path.join(target, 'jest-results.json');
  const redact = (text) => {
    let result = text;
    for (const secret of [
      settings.TEST_DB_PASSWORD,
      settings.TEST_DB_ROOT_PASSWORD,
    ]) {
      if (secret) result = result.split(secret).join('[redacted]');
    }
    return result.replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      '[redacted-jwt]',
    );
  };
  const child = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/jest/bin/jest.js'),
      '--config',
      path.join(root, 'test/jest-http.json'),
      '--runInBand',
      '--no-cache',
      '--json',
      '--outputFile',
      resultPath,
    ],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', (chunk) =>
    process.stdout.write(redact(chunk.toString())),
  );
  child.stderr.on('data', (chunk) =>
    process.stderr.write(redact(chunk.toString())),
  );
  child.on('error', () => {
    console.error('HTTP test process could not start');
    process.exitCode = 1;
  });
  child.on('close', (code) => {
    if (fs.existsSync(resultPath)) {
      fs.writeFileSync(
        resultPath,
        redact(fs.readFileSync(resultPath, 'utf8')),
        'utf8',
      );
    }
    process.exitCode = code ?? 1;
  });
}
try {
  prepare();
} catch {
  console.error(
    'HTTP tests not started. Check explicit flags, private env file, and a new .tmp report directory.',
  );
  process.exitCode = 1;
}
