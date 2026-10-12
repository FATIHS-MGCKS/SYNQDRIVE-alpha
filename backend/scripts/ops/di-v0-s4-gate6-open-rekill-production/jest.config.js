/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/*.spec.ts', '../di-v0-s4-historical-backlog-quarantine-production/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  maxWorkers: 1,
};
