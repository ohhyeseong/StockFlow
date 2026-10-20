const path = require('node:path');
const { jest: config } = require('../package.json');

module.exports = {
  ...config,
  rootDir: path.resolve(__dirname, '..'),
};
