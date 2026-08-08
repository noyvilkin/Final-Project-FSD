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
    // The Apollo code is clean; it just solves the wrong problem. Penalising craftsmanship
    // for a wrong-technology choice contradicts the prompt, which scores codeQuality on the
    // code that IS present (75–90 for clean code that omits a requirement).
    codeQualityRange: { min: 40, max: 90 },
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
    // The critical tier is defined as 10–45; a floor of 15 excluded part of the band the
    // prompt explicitly allows for an omitted core mechanism.
    functionalCorrectnessRange: { min: 10, max: 45 },
    // Unprotected endpoints are a functional gap, not sloppy code — see pkg-01.
    codeQualityRange: { min: 50, max: 90 },
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
    expectedGrades: ['C', 'C+', 'B-', 'B'],
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
    // D+ sits between D and C-, both of which were already accepted; omitting it was an
    // enumeration gap, not a deliberately tighter bound.
    expectedGrades: ['D', 'D+', 'C-', 'C', 'C+'],
    description: 'AI must detect missing /health endpoint',
  },
  {
    id: 'pkg-07',
    folderName: 'package-07-python',
    zipBaseName: 'package-07-python',
    isGood: false,
    violationKey: 'missing_auth',
    violationDescription: 'No JWT authentication on protected endpoints (Python/Flask)',
    secondaryViolation: undefined,
    primaryKeywords: [
      'no auth', 'not authenticated', 'unprotected', 'missing jwt', 'no jwt',
      'jwt authentication', 'jwt auth', 'authentication is missing', 'authentication implementation',
      'lacks authentication', 'no authentication', 'without authentication', 'authentication is absent',
    ],
    functionalCorrectnessRange: { min: 15, max: 55 },
    codeQualityRange: { min: 50, max: 90 },
    expectedGrades: ['F', 'D', 'D+', 'C-'],
    description: 'AI must detect missing JWT auth in a Python/Flask solution',
  },
  {
    id: 'pkg-08',
    folderName: 'package-08-java',
    zipBaseName: 'package-08-java',
    isGood: false,
    violationKey: 'missing_persistence',
    violationDescription: 'In-memory HashMap, no database/JPA (Java/Spring Boot)',
    secondaryViolation: undefined,
    // Detection must name the actual deviation (in-memory / no database), not
    // merely echo the required "PostgreSQL" — so bare postgres keywords are omitted.
    primaryKeywords: [
      'in-memory', 'in memory', 'no database', 'no persistence', 'not persisted',
      'hashmap', 'concurrenthashmap', 'no jpa', 'lost on restart', 'without a database',
      'not postgresql', 'no actual database', 'volatile',
    ],
    // No database at all (data lost on restart) is a CRITICAL functional gap the
    // model grades consistently low — unlike "wrong DB engine", which sat on the
    // moderate/critical boundary and varied run-to-run.
    functionalCorrectnessRange: { min: 10, max: 45 },
    codeQualityRange: { min: 40, max: 90 },
    expectedGrades: ['F', 'D', 'D+'],
    description: 'AI must detect no real persistence (in-memory only) in a Java/Spring Boot solution',
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
    // The solution now satisfies every requirement outright (deterministic tests over a
    // mocked pg cover all four endpoints), so it grades B+/B. B- is deliberately excluded:
    // dropping to B- would mean the grader started penalising a complete solution again.
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

/**
 * Resolves the absolute path to the committed plaintext requirements for a fixture.
 * The eval prefers this over the PDF because pdf-parse/pdfjs extracts these fixtures
 * nondeterministically (see evalPackage), which made grading unreproducible.
 */
export function requirementsTxtPathFor(fixture: PackageFixture): string {
  return path.join(PACKAGES_BASE_PATH, fixture.folderName, 'requirements.txt');
}
