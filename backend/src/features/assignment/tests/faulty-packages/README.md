# Faulty Packages - Semantic Audit Tests

This folder contains intentionally faulty solution packages used by the semantic audit test runner and unit tests.

How to run the semantic audit test runner (requires `COLMAN_LLM_USERNAME`/`COLMAN_LLM_PASSWORD`):

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
- Each package has a `requirements.txt` holding the assignment brief, and an `assignment.pdf` generated from it. The two must always say the same thing. Regenerate the PDF after editing the text: `cupsfilter requirements.txt > assignment.pdf`. Keep lines under ~65 characters — `cupsfilter` renders a fixed-width page and hard-wraps mid-word past that, so `and` comes back out of the PDF as `an` + `d`.
- **The eval harness grades from `assignment.pdf`**, matching the product upload path. Keep `requirements.txt` as the editable source and regenerate the PDF after every edit. Extraction reliability is checked by `npm run verify:pdf` (all eight PDFs, repeated in one process). (Historically the eval had to skip the PDFs: `pdf-parse` corrupted every third extraction with `bad XRef entry`. Replacing it with `pdfjs-dist` fixed that — 40/40 clean where the old parser managed 26/40.)
- **Do not spoil the fault in `requirements.txt`.** Write the brief the student was given, and nothing more. Never write "solution uses SQLite" or "solution contains no tests": that hands the model the answer, and it also skews grades — a brief whose only requirement is "unit tests" makes missing tests look like a core failure, so the grader returns F where the fixture expects C–B.
- **Each package must isolate exactly one fault.** The ZIP is the artifact the eval grades, so write the brief against the files inside the ZIP—not the adjacent `solution/` directory, which may be stale. The brief may only require what the ZIP actually provides, plus the single thing it gets wrong. pkg-04, for example, has no database and no auth, so its brief must not ask for PostgreSQL or JWT — otherwise it fails three core requirements and can no longer test the moderate C–B tier.
- `assignment.pdf` is retained for the product upload pipeline / other tests. To (re)build a zip, archive the *contents* of the `solution/` folder at the archive root (e.g. `cd solution && zip -r ../<name>.zip .`).
