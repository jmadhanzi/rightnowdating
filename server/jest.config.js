/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  // Allow NodeNext-style `.js` import specifiers to resolve to `.ts` sources.
  moduleNameMapper: {
    // libphonenumber-js ships an ESM build that loads its metadata JSON in a
    // shape the jest ESM VM mangles; force the CJS build instead.
    '^libphonenumber-js$': '<rootDir>/../node_modules/libphonenumber-js/index.cjs',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          verbatimModuleSyntax: false,
        },
      },
    ],
  },
  setupFiles: ['<rootDir>/src/tests/jest.setup.ts'],
  testMatch: ['<rootDir>/src/tests/**/*.test.ts'],
  testTimeout: 30000,
  // DB-backed suites share Postgres/Redis — run serially to avoid pool exhaustion.
  maxWorkers: 1,
  // ioredis/pool keep handles open briefly; force a clean exit after the run.
  forceExit: true,
};
