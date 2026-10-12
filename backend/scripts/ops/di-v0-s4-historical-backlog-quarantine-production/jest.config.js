/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  maxWorkers: 1,
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../../../src/shared/$1',
    '^@modules/(.*)$': '<rootDir>/../../../src/modules/$1',
    '^@workers/(.*)$': '<rootDir>/../../../src/workers/$1',
    '^@config/(.*)$': '<rootDir>/../../../src/config/$1',
  },
};
