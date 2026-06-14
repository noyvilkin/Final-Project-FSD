# Faulty Packages - Semantic Audit Tests

This folder contains intentionally faulty solution packages used by the semantic audit test runner and unit tests.

How to run the semantic audit test runner (mock AI, fast):

```powershell
$env:SEMANTIC_AUDIT_USE_MOCK_AI='true'
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
- `SEMANTIC_AUDIT_USE_MOCK_AI=true` — use the deterministic local mock instead of calling Gemini.
- `SEMANTIC_AUDIT_PACKAGE_COOLDOWN_MS` — cooldown between packages (ms).
- `SEMANTIC_AUDIT_FINAL_PACKAGE_COOLDOWN_MS` — cooldown before final package (ms).

Where results are written:
- The test runner exports JSON results to `backend/src/features/assignment/tests/results/`.
  This folder is ignored by the backend `.gitignore` to avoid committing large run artifacts.

Notes:
- Tests use the zips in this folder as inputs. If you change package names or add new packages, update the test runner configuration.
