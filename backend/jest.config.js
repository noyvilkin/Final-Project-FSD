import { createDefaultPreset } from "ts-jest";

const tsJestTransformCfg = createDefaultPreset({ diagnostics: { ignoreCodes: [151002] } }).transform;

/** @type {import("jest").Config} **/
const config = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  setupFiles: ["<rootDir>/src/tests/setup-env.js"],
  collectCoverageFrom: [
    "src/common/auth/**/*.ts",
    "src/features/auth/**/*.ts",
    "!src/**/*.d.ts",
    "!src/tests/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  testMatch: ["**/tests/**/*.test.ts", "**/__tests__/**/*.spec.ts"],
  testTimeout: 30000,
  maxWorkers: 1, // Run tests sequentially to avoid database conflicts
  forceExit: true, // Force Jest to exit after all tests complete
  detectOpenHandles: false, // Disable open handle detection in CI
};

export default config;