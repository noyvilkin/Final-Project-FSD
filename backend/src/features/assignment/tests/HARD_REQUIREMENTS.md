# Semantic Audit: Hard Requirements & Success Criteria

This document defines what each test package should satisfy and how AI evaluation will be validated.

---

## Package-01: GraphQL Server (Wrong API Style)

### Assignment Requirements (What Assignment Asked For)
```
Requirement: Build a REST API using Express.js
- Framework: Express (not GraphQL, not other frameworks)
- Protocol: HTTP REST with standard methods (GET, POST, PUT, DELETE)
- Port: 3000
- Key Endpoints: /health, /api/users, /api/items
```

### Actual Solution
- Framework: Apollo Server (GraphQL)
- Protocol: GraphQL with resolvers
- Port: 4000
- Endpoints: GraphQL queries/mutations only

### AI Detection Criteria
| Aspect | Must Detect | Score Impact |
|--------|------------|--------------|
| API Style | ❌ Not REST, uses GraphQL | Functional Correctness: 0-30% |
| Framework | ❌ Not Express | Functional Correctness: 0-30% |
| Error Handling | ⚠️ Broken error middleware | Code Quality: -20% |
| Input Validation | ⚠️ Missing validation | Code Quality: -15% |

### Success Criteria for AI
- ✅ PASS if AI identifies "GraphQL instead of REST" in feedback
- ✅ PASS if Functional Correctness score is <45%
- ✅ PASS if mentions "Apollo Server" or "GraphQL"
- ✅ BONUS if also catches error handling issues
- ❌ FAIL if AI rates this as acceptable

### Expected AI Feedback Grade: F or D (0-40%)

---

## Package-02: SQLite Server (Wrong Database)

### Assignment Requirements
```
Requirement: Build REST API with PostgreSQL database
- Database: PostgreSQL (not SQLite, not MySQL)
- Connection Type: Connection pool to remote/local PostgreSQL instance
- Key Tables: users, items, orders (with relationships)
- Key Features: User authentication, CRUD operations
```

### Actual Solution
- Database: SQLite (in-memory)
- No connection pool
- Tables present but SQLite implementation
- Auth endpoints without input validation

### AI Detection Criteria
| Aspect | Must Detect | Score Impact |
|--------|------------|--------------|
| Database Type | ❌ SQLite not PostgreSQL | Functional Correctness: 0-40% |
| Connection Pool | ❌ No pool config | Code Quality: -20% |
| Input Validation | ⚠️ Missing on auth | Code Quality: -20% |
| Schema Design | ✓ Reasonable | Code Quality: +10% |

### Success Criteria for AI
- ✅ PASS if AI identifies "SQLite instead of PostgreSQL"
- ✅ PASS if Functional Correctness score is 30-55%
- ✅ PASS if mentions database type mismatch
- ✅ BONUS if also catches validation issues
- ❌ FAIL if AI doesn't catch the DB type difference

### Expected AI Feedback Grade: D or C- (30-50%)

---

## Package-03: Express Server (Missing JWT Auth)

### Assignment Requirements
```
Requirement: Implement JWT authentication for protected endpoints
- Auth Method: JSON Web Tokens (JWT)
- Protected Endpoints: All data mutation endpoints (/api/items POST, PUT, DELETE, etc.)
- Public Endpoints: /health, /api/items GET, login
- Token Generation: /auth/login endpoint
- Token Validation: Authorization: Bearer <token> header
```

### Actual Solution
- JWT library imported but NEVER used on any endpoint
- Auth middleware defined but NEVER applied to routes
- All endpoints completely public
- Login returns dummy token (not JWT)
- Looks like auth is set up, but isn't actually working

### AI Detection Criteria
| Aspect | Must Detect | Score Impact |
|--------|------------|--------------|
| Auth Implementation | ❌ JWT never applied | Functional Correctness: 0-40% |
| Protected Endpoints | ❌ All public | Functional Correctness: 0-40% |
| Unused Imports | ⚠️ JWT/bcryptjs imported | Code Quality: -15% |
| Middleware Applied | ⚠️ Defined but unused | Code Quality: -20% |

### Success Criteria for AI
- ✅ PASS if AI identifies "no JWT authentication"
- ✅ PASS if Functional Correctness score is 20-45%
- ✅ PASS if mentions endpoints are unprotected
- ✅ DIFFICULT: Mention that JWT is imported but not used (catches subtle issues)
- ❌ FAIL if AI thinks auth is implemented because imports are present

**This is the HARDEST package to detect because it LOOKS like auth is set up.**

### Expected AI Feedback Grade: F or D (20-40%)

---

## Package-04: Express Server (Missing Tests)

### Assignment Requirements
```
Requirement: Include unit tests for all core endpoints
- Test Framework: Jest or Mocha
- Coverage: All CRUD operations (GET, POST, PUT, DELETE)
- Minimum Tests: 
  - User creation
  - User retrieval
  - Item operations
  - Error cases (404, 400, 500)
- Test Execution: package.json includes "test" script
```

### Actual Solution
- package.json has `"test": "jest --coverage"` script configured
- Jest and supertest in devDependencies
- But NO actual test files exist (no .test.js or __tests__ directory)
- Only server.js exists (100 LOC with good endpoints)

### AI Detection Criteria
| Aspect | Must Detect | Score Impact |
|--------|------------|--------------|
| Test Files | ❌ No test files found | Functional Correctness: -25% |
| Test Script Configured | ✓ Script exists | Code Quality: +5% |
| Test Coverage | ❌ 0% coverage | Functional Correctness: 0-40% |
| Server Code Quality | ✓ Well-structured | Code Quality: +20% |

### Success Criteria for AI
- ✅ PASS if AI identifies "no test files" or "0% test coverage"
- ✅ PASS if Functional Correctness score is 60-85%
- ✅ PASS if mentions that tests are missing
- ✅ BONUS if notes "test script configured but not implemented"
- ❌ FAIL if AI thinks tests exist because package.json has test script

### Expected AI Feedback Grade: C or C+ (60-85%)

---

## Package-05: Express Server (Missing /health Endpoint)

### Assignment Requirements
```
Requirement: Implement GET /health endpoint
- Endpoint: GET /health (exact name and method)
- Response Code: 200 OK
- Response Format: JSON with status information
  { "status": "ok" | "running", "timestamp": ... }
- Public Endpoint: No authentication required
```

### Actual Solution
- Provides /status endpoint instead
- Provides /api/server-status endpoint instead
- Both return similar information (uptime, timestamp, environment)
- But NOT /health endpoint specifically
- Other endpoints (CRUD) are well-implemented

### AI Detection Criteria
| Aspect | Must Detect | Score Impact |
|--------|------------|--------------|
| /health Endpoint | ❌ Not found | Functional Correctness: -30% |
| Similar Endpoints | ⚠️ /status exists | Partial credit: +5% |
| Naming Accuracy | ❌ Wrong names | Functional Correctness: -30% |
| Other Endpoints | ✓ Well-implemented | Code Quality: +20% |

### Success Criteria for AI
- ✅ PASS if AI identifies "GET /health endpoint missing"
- ✅ PASS if Functional Correctness score is 50-75%
- ✅ PASS if doesn't accept /status as substitute
- ✅ BONUS if mentions specific endpoint requirement
- ❌ FAIL if AI thinks /status satisfies the /health requirement

### Expected AI Feedback Grade: C or C- (50-75%)

---

## Package-06: Express Server (Correct Solution)

### Assignment Requirements
```
Requirement: Build REST API with all of the above
- Framework: Express.js ✓
- Database: PostgreSQL ✓
- Auth: JWT on protected endpoints ✓
- Health: GET /health endpoint ✓
- Tests: Unit tests with coverage ✓
- Code Quality: Error handling, middleware, validation ✓
```

### Actual Solution
- REST API with Express ✓
- PostgreSQL connection pool configured ✓
- JWT middleware applied to protected routes ✓
- /health endpoint returning 200 ✓
- 75 LOC of Jest + supertest unit tests ✓
- Error handling middleware ✓
- Request/response validation ✓

### AI Detection Criteria
| Aspect | Must Confirm | Score Impact |
|--------|------------|--------------|
| API Style | ✓ REST with Express | Functional Correctness: +40% |
| Database | ✓ PostgreSQL | Functional Correctness: +30% |
| Auth | ✓ JWT applied | Functional Correctness: +20% |
| Health Endpoint | ✓ /health exists | Functional Correctness: +10% |
| Tests | ✓ Tests present | Functional Correctness: +15% |
| Error Handling | ✓ Present | Code Quality: +15% |

### Success Criteria for AI
- ✅ PASS if AI identifies all requirements are met
- ✅ PASS if Functional Correctness score is 85%+
- ✅ PASS if mentions "meets all core requirements"
- ✅ PASS if grade is A- or B+
- ✅ BONUS if suggests minor improvements only
- ❌ FAIL if AI falsely flags non-issues or misses real problems

### Expected AI Feedback Grade: A- or B+ (80-95%)

---

## Summary: Detection Difficulty & Expected Outcomes

| Package | Difficulty | Primary Violation | Expected AI Score | Detection Likelihood |
|---------|-----------|------------------|------------------|---------------------|
| pkg-01 | ⭐⭐ Easy | GraphQL vs REST | 20-40% | 95% ✓ |
| pkg-02 | ⭐⭐⭐ Hard | SQLite vs PostgreSQL | 30-50% | 85% ✓ |
| pkg-03 | ⭐⭐⭐⭐ Very Hard | Unused JWT middleware | 20-40% | 70% ⚠️ |
| pkg-04 | ⭐⭐ Easy | No test files | 60-85% | 90% ✓ |
| pkg-05 | ⭐⭐ Easy | Missing /health | 50-75% | 85% ✓ |
| pkg-06 | ✓ Good | NONE | 80-95% | 100% ✓ |

---

## Phase 2: Success Criteria Definition

**Goal**: AI must catch ≥95% of intentional violations

**Threshold for "Good Detection"**:
- ✅ Catches primary violation (in feedback text or score impact)
- ✅ Score reflects violation severity
- ✅ Provides actionable feedback
- ❌ Does NOT give false positives on good code

**Threshold for "Excellent Detection"**:
- ✅ All of above
- ✅ Also identifies secondary violations
- ✅ Explains compound impact of violations
- ✅ Distinguishes between critical and minor issues

