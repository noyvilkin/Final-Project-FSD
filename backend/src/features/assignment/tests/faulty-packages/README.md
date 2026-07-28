# Faulty Packages - Semantic Audit Tests

This folder contains intentionally faulty solution packages used by the semantic audit test runner and unit tests.

How to run the semantic audit test runner (requires `GEMINI_API_KEY`):

```powershell
$env:SEMANTIC_AUDIT_PACKAGE_COOLDOWN_MS='1000'
$env:SEMANTIC_AUDIT_FINAL_PACKAGE_COOLDOWN_MS='2000'
npm exec tsx -- src/features/assignment/scripts/semanticAuditTestRunner.ts
```

How to run the unit tests (ZipProcessor, etc.):

```powershell
# From backend folder
npm test
```

Environment toggles:
- `SEMANTIC_AUDIT_PACKAGE_COOLDOWN_MS` — cooldown between packages (ms).
- `SEMANTIC_AUDIT_FINAL_PACKAGE_COOLDOWN_MS` — cooldown before final package (ms).

Where results are written:
- The test runner exports JSON results to `backend/src/features/assignment/tests/results/`.
  This folder is ignored by the backend `.gitignore` to avoid committing large run artifacts.

Packages (language coverage):
- `package-01`..`package-05` — JavaScript/Node faulty solutions (wrong API style, wrong DB, missing auth, missing tests, missing /health).
- `package-06-good` — clean JavaScript solution (must NOT raise false positives).
- `package-07-python` — Python/Flask, missing JWT auth on protected endpoints.
- `package-08-java` — Java/Spring Boot, in-memory H2 used instead of the required PostgreSQL.

Notes:
- Tests use the zips in this folder as inputs. If you change package names or add new packages, update the eval fixtures in `src/features/assignment/eval/fixtures.ts` (and `RUN_ORDER` in `runEval.ts`).
- To regenerate a package's `assignment.pdf` from plain text on macOS: `cupsfilter requirements.txt > assignment.pdf`. To (re)build a zip, archive the *contents* of the `solution/` folder at the archive root (e.g. `cd solution && zip -r ../<name>.zip .`).
