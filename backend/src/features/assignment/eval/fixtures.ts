/** Fixture configs for the assignment AI eval — one per faulty/good package. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BACKEND_ROOT = path.resolve(__dirname, '../../../../');

export const PACKAGES_BASE_PATH = path.join(
  BACKEND_ROOT,
  'src/features/assignment/tests/faulty-packages'
);

export interface PackageFixture {
  id: string;
  folderName: string;
  zipBaseName: string;
  isGood: boolean;
  violationKey: string;
  violationDescription: string;
  secondaryViolation?: string;
  primaryKeywords: string[];
  secondaryKeywords?: string[];
  functionalCorrectnessRange: { min: number; max: number };
  codeQualityRange: { min: number; max: number };
  expectedGrades: string[];
  description: string;
}

export const PACKAGE_FIXTURES: PackageFixture[] = [
  {
    id: 'pkg-01',
    folderName: 'package-01',
    zipBaseName: 'package-01',
    isGood: false,
    violationKey: 'wrong_api_style',
    violationDescription: 'GraphQL (Apollo) instead of REST (Express)',
    secondaryViolation: 'missing_error_handling',
    primaryKeywords: ['graphql', 'apollo', 'not rest', 'wrong api'],
    secondaryKeywords: ['error handling', 'validation', 'input validation'],
    functionalCorrectnessRange: { min: 0, max: 45 },
    codeQualityRange: { min: 40, max: 70 },
    expectedGrades: ['F', 'D'],
    description: 'AI must detect GraphQL used instead of REST',
  },
  {
    id: 'pkg-02',
    folderName: 'package-02',
    zipBaseName: 'package-02',
    isGood: false,
    violationKey: 'wrong_database',
    violationDescription: 'SQLite instead of PostgreSQL',
    secondaryViolation: 'missing_input_validation',
    primaryKeywords: ['sqlite', 'not postgresql', 'wrong database', 'sqlite instead'],
    secondaryKeywords: ['validation', 'input validation', 'sanitization'],
    functionalCorrectnessRange: { min: 0, max: 45 },
    codeQualityRange: { min: 40, max: 85 },
    expectedGrades: ['F', 'D'],
    description: 'AI must detect SQLite used instead of PostgreSQL',
  },
  {
    id: 'pkg-03',
    folderName: 'package-03',
    zipBaseName: 'package-03',
    isGood: false,
    violationKey: 'missing_auth',
    violationDescription: 'No JWT authentication on protected endpoints',
    secondaryViolation: 'unused_jwt_imports',
    primaryKeywords: [
      'no auth', 'not authenticated', 'unprotected', 'missing jwt', 'no jwt',
      'jwt authentication', 'jwt auth', 'authentication is missing', 'authentication implementation',
      'lacks authentication', 'no authentication', 'without authentication', 'authentication is absent',
    ],
    secondaryKeywords: ['jwt', 'imported but', 'middleware', 'unused', 'not applied'],
    functionalCorrectnessRange: { min: 15, max: 45 },
    codeQualityRange: { min: 50, max: 75 },
    expectedGrades: ['F', 'D'],
    description: 'AI must detect missing JWT auth (HARDEST — JWT imported but unused)',
  },
  {
    id: 'pkg-04',
    folderName: 'package-04',
    zipBaseName: 'package-04',
    isGood: false,
    violationKey: 'missing_tests',
    violationDescription: 'No unit test files',
    secondaryViolation: 'test_config_no_tests',
    primaryKeywords: [
      'no test', 'no tests', 'missing test', 'missing tests',
      'unit test', 'unit tests', 'test file', 'test files',
      'test suite', 'test coverage', '0% coverage',
    ],
    secondaryKeywords: [
      'test script', 'jest', 'test configured', 'but no tests',
      'complete absence of unit tests', 'unit or integration tests',
    ],
    functionalCorrectnessRange: { min: 55, max: 90 },
    codeQualityRange: { min: 75, max: 90 },
    expectedGrades: ['C', 'C+'],
    description: 'AI must detect missing test files',
  },
  {
    id: 'pkg-05',
    folderName: 'package-05',
    zipBaseName: 'package-05',
    isGood: false,
    violationKey: 'missing_health_endpoint',
    violationDescription: 'GET /health endpoint missing',
    secondaryViolation: 'wrong_endpoint_names',
    primaryKeywords: ['/health', 'health endpoint', 'missing /health', 'not found'],
    secondaryKeywords: ['/status', 'wrong name', 'endpoint name', 'not /health'],
    functionalCorrectnessRange: { min: 45, max: 80 },
    codeQualityRange: { min: 75, max: 90 },
    expectedGrades: ['C', 'C-'],
    description: 'AI must detect missing /health endpoint',
  },
  {
    id: 'pkg-06',
    folderName: 'package-06-good',
    zipBaseName: 'package-06-good',
    isGood: true,
    violationKey: 'none',
    violationDescription: 'Good solution — all requirements met',
    primaryKeywords: ['express', 'postgresql', 'jwt', 'health', 'test'],
    functionalCorrectnessRange: { min: 75, max: 100 },
    codeQualityRange: { min: 80, max: 100 },
    expectedGrades: ['A', 'A-', 'B+', 'B'],
    description: 'AI must NOT raise false positives on a clean solution',
  },
];

/** Resolves the absolute path to the zip file for a fixture. */
export function zipPathFor(fixture: PackageFixture): string {
  return path.join(PACKAGES_BASE_PATH, fixture.folderName, `${fixture.zipBaseName}.zip`);
}

/** Resolves the absolute path to the assignment PDF for a fixture. */
export function assignmentPdfPathFor(fixture: PackageFixture): string {
  return path.join(PACKAGES_BASE_PATH, fixture.folderName, 'assignment.pdf');
}
