/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  moduleNameMapper: {
    '^@modules/(.*)$': '<rootDir>/../../src/modules/$1',
    '^@shared/(.*)$': '<rootDir>/../../src/shared/$1',
  },
};
