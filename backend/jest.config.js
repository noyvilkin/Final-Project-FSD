import { createDefaultPreset } from 'ts-jest';

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/server.ts",
    "!src/tests/**",
    "!src/**/POC/**",
    "!src/common/utils/pdfProcessor.ts",
  ],
  coveragePathIgnorePatterns: [
    "/src/features/.*/POC/",
    "/src/common/utils/pdfProcessor.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  testMatch: ["**/tests/**/*.test.ts"],
  testTimeout: 30000,
  maxWorkers: 1, // Run tests sequentially to avoid database conflicts
  forceExit: true, // Force Jest to exit after all tests complete
  detectOpenHandles: false, // Disable open handle detection in CI
};