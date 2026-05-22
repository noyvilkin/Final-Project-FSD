# PHASE 2: AI Semantic Audit Success Criteria Checklist

Use this checklist when running tests in PHASE 4 to validate AI performance.

---

## Testing Rubric by Package

### Package-01: GraphQL (Wrong API Style)

**Test ID**: `pkg-01-graphql-detection`

#### Primary Detection (MUST CATCH)
- [ ] AI mentions "GraphQL" anywhere in feedback
- [ ] AI mentions "Apollo Server"
- [ ] AI identifies this is NOT REST API
- [ ] AI identifies this is NOT using Express
- [ ] Functional Correctness score is <50%

#### Secondary Detection (SHOULD CATCH)
- [ ] AI mentions missing error handling
- [ ] AI mentions lack of input validation
- [ ] AI flags security concerns (unfiltered error objects)

#### Scoring Validation
- [ ] Functional Correctness: 0-40% (primary violation too severe)
- [ ] Code Quality: 40-70% (has structure but broken practices)
- [ ] Overall Grade: F or D (not acceptable)

#### Pass Criteria
```
PASS if:
  - Identifies GraphQL instead of REST (PRIMARY)
  - AND Functional Correctness <50%
  - AND Grade is F or D
  
Partial Pass if:
  - Mentions GraphQL but score too high (40%+)
  
FAIL if:
  - Doesn't mention GraphQL/Apollo
  - OR rates as acceptable (C or higher)
  - OR Functional Correctness >50%
```

---

### Package-02: SQLite (Wrong Database)

**Test ID**: `pkg-02-sqlite-detection`

#### Primary Detection (MUST CATCH)
- [ ] AI mentions "SQLite" anywhere in feedback
- [ ] AI mentions "PostgreSQL requirement"
- [ ] AI identifies database mismatch
- [ ] Functional Correctness score is 30-55%
- [ ] Grade is lower than good solution

#### Secondary Detection (SHOULD CATCH)
- [ ] AI mentions missing input validation
- [ ] AI mentions auth endpoints lack password strength checks
- [ ] AI flags missing user existence checks on foreign keys

#### Scoring Validation
- [ ] Functional Correctness: 30-55% (significant issue but core logic works)
- [ ] Code Quality: 50-75% (code structure is decent)
- [ ] Overall Grade: D or C- (below good)

#### Pass Criteria
```
PASS if:
  - Identifies SQLite instead of PostgreSQL (PRIMARY)
  - AND Functional Correctness 30-55%
  - AND Grade lower than pkg-06
  
Partial Pass if:
  - Mentions database but score outside range
  
FAIL if:
  - Doesn't mention database difference
  - OR rates as acceptable (B or higher)
  - OR Functional Correctness >60%
```

---

### Package-03: Missing JWT Auth (HARDEST DETECTION)

**Test ID**: `pkg-03-missing-auth-detection`

#### Primary Detection (MUST CATCH)
- [ ] AI identifies "no JWT authentication"
- [ ] AI identifies "endpoints are public"
- [ ] AI identifies "auth not implemented"
- [ ] Functional Correctness score is 20-45%
- [ ] Grade is F or D

#### Secondary Detection (HARDER - CRITICAL FOR SEMANTIC AUDIT)
- [ ] AI mentions "JWT imported but not used" (SUBTLE!)
- [ ] AI mentions "auth middleware defined but not applied"
- [ ] AI notes that it "looks like auth is set up but isn't"
- [ ] AI calls out unused dependencies

#### Scoring Validation
- [ ] Functional Correctness: 20-45% (missing critical feature)
- [ ] Code Quality: 50-75% (code structure itself is fine)
- [ ] Overall Grade: F or D (security issue)

#### Pass Criteria
```
PASS if:
  - Identifies missing JWT auth (PRIMARY)
  - AND Functional Correctness 20-45%
  - AND Grade is F or D
  
EXCELLENT if:
  - ALSO identifies unused imports/middleware (SECONDARY)
  - Notes that it "looks almost right"
  
Partial Pass if:
  - Mentions auth missing but score too high
  
FAIL if:
  - Doesn't catch missing auth
  - OR thinks auth is implemented (because JWT is imported)
  - OR Functional Correctness >50%
```

**SEMANTIC AUDIT INDICATOR**: If AI catches the secondary (unused middleware), it's doing REAL semantic analysis, not just keyword matching.

---

### Package-04: Missing Tests

**Test ID**: `pkg-04-no-tests-detection`

#### Primary Detection (MUST CATCH)
- [ ] AI identifies "no test files" or "0% test coverage"
- [ ] AI identifies "tests missing"
- [ ] AI does NOT accept test configuration as proof of tests
- [ ] Functional Correctness score is 60-85%
- [ ] Grade is C or C+

#### Secondary Detection (SHOULD CATCH)
- [ ] AI notes "package.json has test script but no tests"
- [ ] AI suggests specific tests to add (user creation, error cases)
- [ ] AI distinguishes between "tests configured" vs "tests written"

#### Scoring Validation
- [ ] Functional Correctness: 60-85% (code works, but untested)
- [ ] Code Quality: 75-90% (code itself is well-written)
- [ ] Overall Grade: C or C+ (acceptable but incomplete)

#### Pass Criteria
```
PASS if:
  - Identifies no test files (PRIMARY)
  - AND Functional Correctness 60-85%
  - AND Grade is C or C+
  - AND mentions tests are missing (not "tests configured")
  
EXCELLENT if:
  - Notes "test script configured but not implemented"
  - Suggests what tests should be written
  
Partial Pass if:
  - Catches missing tests but score outside range
  
FAIL if:
  - Accepts test configuration as sufficient
  - OR Functional Correctness >90%
  - OR Grade is B or higher
```

---

### Package-05: Missing /health Endpoint

**Test ID**: `pkg-05-no-health-detection`

#### Primary Detection (MUST CATCH)
- [ ] AI identifies "GET /health missing"
- [ ] AI identifies "/health endpoint not found"
- [ ] AI does NOT accept /status as substitute
- [ ] Functional Correctness score is 50-75%
- [ ] Grade is C or C-

#### Secondary Detection (SHOULD CATCH)
- [ ] AI mentions "/status is not the same as /health"
- [ ] AI notes specific endpoint requirement not met
- [ ] AI flags ambiguous naming as an issue
- [ ] AI identifies /api/server-status doesn't satisfy requirement

#### Scoring Validation
- [ ] Functional Correctness: 50-75% (missing required feature)
- [ ] Code Quality: 75-85% (other code well-structured)
- [ ] Overall Grade: C or C- (incomplete)

#### Pass Criteria
```
PASS if:
  - Identifies /health missing (PRIMARY)
  - AND Functional Correctness 50-75%
  - AND Grade is C or C-
  - AND does NOT accept /status as valid substitute
  
EXCELLENT if:
  - Notes that /status is similar but wrong name
  - Suggests exact endpoint implementation
  
Partial Pass if:
  - Catches missing health but accepts /status
  
FAIL if:
  - Accepts /status as meeting requirement
  - OR Functional Correctness >80%
  - OR Grade is B or higher
```

---

### Package-06: Good Solution (BASELINE)

**Test ID**: `pkg-06-good-detection`

#### Positive Detection (MUST CONFIRM)
- [ ] AI identifies "meets all requirements"
- [ ] AI identifies "REST API with Express"
- [ ] AI identifies "PostgreSQL configured"
- [ ] AI identifies "JWT authentication implemented"
- [ ] AI identifies "/health endpoint present"
- [ ] AI identifies "unit tests present"
- [ ] Functional Correctness score is 85%+
- [ ] Grade is A- or B+

#### Quality Feedback (SHOULD HAVE)
- [ ] AI provides constructive suggestions (not false negatives)
- [ ] AI mentions specific strengths
- [ ] AI only flags minor improvements
- [ ] AI does NOT invent issues that don't exist

#### Scoring Validation
- [ ] Functional Correctness: 85-95% (meets core, room for polish)
- [ ] Code Quality: 80-90% (well-written, some suggestions OK)
- [ ] Overall Grade: A- or B+ (good solution)

#### Pass Criteria
```
PASS if:
  - Confirms all 5 core requirements
  - AND Functional Correctness 80%+
  - AND Grade is A- or B+
  - AND feedback is constructive without false issues
  
Partial Pass if:
  - Misses one requirement confirmation
  
FAIL if:
  - Functional Correctness <80%
  - OR Grade is C or lower
  - OR False negatives (flags non-existent issues)
```

---

## Overall Test Run Success Criteria

### Minimum Threshold (AI Must Achieve This)
```
✅ PASS OVERALL if:
  - pkg-01: Detects GraphQL violation (primary)
  - pkg-02: Detects SQLite violation (primary)
  - pkg-03: Detects missing auth (primary)
  - pkg-04: Detects missing tests (primary)
  - pkg-05: Detects missing /health (primary)
  - pkg-06: Confirms good solution

Detection Rate: 6/6 primary violations = 100%
```

### Target Threshold (Semantic Audit Quality)
```
✨ EXCELLENT if ABOVE PLUS:
  - pkg-01: Catches error handling issues (secondary)
  - pkg-02: Catches input validation (secondary)
  - pkg-03: Catches unused JWT middleware (secondary) ← CRITICAL
  - pkg-04: Notes test config mismatch (secondary)
  - pkg-05: Explains /status vs /health (secondary)
  - pkg-06: Suggests only realistic improvements

Detection Rate: 6/6 primary + 5/5 secondary = 100%
Secondary Detection Rate: 5/5 = 100% (proves semantic audit depth)
```

---

## Validation Scoring

### Detection Rate Calculation
```
Primary Violations Caught: X out of 5
Secondary Violations Caught: Y out of 5
Good Solution Validated: 0 or 1

SCORE = (Primary + Secondary + Good) / 11

90-100% = ⭐⭐⭐⭐⭐ Excellent (real semantic auditing)
80-89%  = ⭐⭐⭐⭐  Good (catches most issues)
70-79%  = ⭐⭐⭐   Acceptable (catches primaries)
60-69%  = ⭐⭐    Needs Improvement
<60%    = ⭐     Failed (missing critical detections)
```

### Red Flags (Indicates Surface-Level Analysis)
- ❌ AI accepts /status as /health replacement
- ❌ AI thinks auth is implemented because JWT is imported
- ❌ AI doesn't mention tests missing (accepts test script)
- ❌ AI rates pkg-03 higher than C grade
- ❌ AI rates pkg-06 lower than B+ grade
- ❌ AI uses only keyword matching, no actual code review

### Green Flags (Indicates Deep Semantic Analysis)
- ✅ AI catches unused middleware + unused imports
- ✅ AI distinguishes between "configured" vs "implemented"
- ✅ AI notes semantic correctness vs. syntax correctness
- ✅ AI explains WHY code is wrong, not just THAT it's wrong
- ✅ AI suggests specific improvements with code examples
- ✅ AI catches compound violations (primary + secondary)

---

## PHASE 4: Test Execution Checklist

When running the semantic audit tests, use this order:

1. [ ] **pkg-01 GraphQL** - Easiest detection (should be 95%+ success)
2. [ ] **pkg-04 No Tests** - Easy detection (should be 90%+ success)
3. [ ] **pkg-05 No Health** - Easy detection (should be 85%+ success)
4. [ ] **pkg-02 SQLite** - Harder detection (should be 80%+ success)
5. [ ] **pkg-03 No Auth** - Hardest detection (should be 70%+, CRITICAL TEST)
6. [ ] **pkg-06 Good** - Validation (should be 95%+ success)

**Note**: pkg-03 is the litmus test for semantic audit depth. If AI catches the unused middleware, it's doing real analysis.

