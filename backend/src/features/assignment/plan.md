# Semantic Auditing Validation Mission Plan

## Problem Statement
The current project evaluates AI's semantic auditing capability—detecting if a solution truly satisfies assignment requirements, not just checking if code is "clean". Standard code reviewers miss critical requirement violations (e.g., wrong API style, missing mandatory features).

**Goal**: Validate that the Assignment Evaluation Service correctly identifies requirement violations and provides accurate feedback through deep semantic analysis.

## Current State Assessment
- **6 Test Packages**: 5 with intentional violations + 1 correct solution
- **Current Issues**: Packages may be "thin" (insufficient code complexity)
- **Existing Infrastructure**:
  - AssignmentAnalysisService: Extracts PDF requirements + analyzes project structure
  - AIAnalysisService: Generates semantic feedback (code quality, functional correctness, best practices)
  - Models: Defined for storing requirements analysis and AI feedback
  - Violation Metadata: Packages include violation_key and violation_description

## Multi-Phase Approach

### PHASE 1: Audit & Enhance Test Packages (Current State)
**Goal**: Ensure test packages are realistic and comprehensive

#### 1.1 Audit Current Packages
- [ ] Review each of 5 faulty packages:
  - What specific violation does each have?
  - Is the violation clearly defined in metadata?
  - Is the solution code realistic and substantial enough?
  - Can an AI realistically detect this violation?
- [ ] Audit the "good" package (package-06-good):
  - Does it truly satisfy all requirements?
  - Is it comprehensive enough to validate positive feedback?

#### 1.2 Define Hard Requirements per Package
Create a structured requirement definition for each:
- Package-01: REST API with Express (currently: GraphQL with Apollo)
- Packages 2-5: Identify or define violations
- Package-06-good: Complete, passing solution

#### 1.3 Enhance Package Substance
If packages are too thin:
- **Option A**: Expand existing solutions with more realistic code
- **Option B**: Add additional violations (e.g., missing error handling + wrong DB)
- **Option C**: Create completely new packages with more complex requirements
- **Recommendation**: Do A + B (expand code AND add additional violations) to keep validation focused but realistic

---

### PHASE 2: Define Evaluation Criteria (Success Metrics)
**Goal**: Create measurable benchmarks for AI semantic auditing performance

#### 2.1 Detection Rate Metrics
For each faulty package, define:
- **Primary Violation**: The main requirement breach (e.g., "GraphQL instead of REST")
- **Expected AI Behavior**: Should identify in functionalCorrectness.missingFeatures[] or score
- **Test Assertion**: AI score should be <70% OR include specific finding in feedback

#### 2.2 Accuracy Validation Rules
- Strengths: Only acknowledge what's actually good about the code
- Improvements: Must include the primary violation as #1 or #2 priority
- Functional Correctness Score: Should reflect the severity of violation
  - Critical violations: 0-40%
  - Major violations: 40-60%
  - Minor violations: 60-80%

#### 2.3 Noise Reduction Criteria
- Verify 100% of non-source files are filtered (.git, node_modules, dist, etc.)
- Check that sourceCodeContent only includes relevant source files
- Validate that analysis isn't bloated with build artifacts

---

### PHASE 3: Create Test Execution Framework
**Goal**: Systematize validation testing and result tracking

#### 3.1 Create Test Runner Service - **stopped here!**
Build `D:\Study\3rd Year\Final-Project\Final-Project-FSD\backend\src\features\assignment\scripts\semanticAuditTestRunner.ts` that:
- Loads all 6 packages sequentially
- Runs each through AssignmentAnalysisService + AIAnalysisService
- Captures results in database
- Generates detection rate report (% violations caught)
- Include debugging (console.log) for each step

#### 3.2 Create Assertion Framework
Build `D:\Study\3rd Year\Final-Project\Final-Project-FSD\src\features\assignment\scripts\semanticAuditAssertions.ts` to verify:
- `assertViolationDetected(packageId, violationType)`: Did AI catch the violation?
- `assertFunctionalCorrectnessScore(packageId, minScore, maxScore)`: Is score reasonable?
- `assertNoNoiseInAnalysis(packageId)`: Are node_modules filtered out?
- `assertAccurateFeatureMissingList(packageId, expectedMissing)`: Features list accurate?

#### 3.3 Create Results Aggregator
Build report showing:
- Detection Rate: X/6 violations caught (target: 100%)
- Accuracy per Package: Detailed results for each
- Noise Reduction: % of non-source files successfully filtered
- AI Feedback Quality: Strengths/Improvements alignment

---

### PHASE 4: Execution & Validation
**Goal**: Run tests and identify gaps in AI's semantic auditing

#### 4.1 Run Test Suite
- Execute all 6 packages through services
- Capture raw results and processing logs
- Document any processing errors

#### 4.2 Analyze Results
- Add debugging (console.log) to capture intermediate analysis steps
- Identify which violations were caught vs. missed
- Assess why violations were missed (insufficient context? unclear requirement?)
- Evaluate feedback quality: Are strengths/improvements logically consistent?

#### 4.3 Document Findings
- Create executive summary: "AI detected X/6 critical violations"
- List gaps: What patterns did AI miss?
- Provide recommendations: What's needed for 100% detection?

---

### PHASE 5: Iterate & Improve (Optional)
**Goal**: Close gaps if detection rate is <100%

#### 5.1 Possible Improvements
- **Enhance package requirements**: Make violations more explicit in PDF
- **Adjust AI prompt**: Add specific violation patterns to look for
- **Expand test set**: Add edge cases or ambiguous requirement scenarios
- **Improve project analysis**: Ensure metadata extraction is comprehensive

---

## Success Criteria (Final)
✅ **Requirement Coverage**: AI must catch ≥95% of critical requirement violations  
✅ **Noise Reduction**: 100% of non-source files successfully filtered  
✅ **Feedback Accuracy**: Strengths/Improvements align with violation severity  
✅ **Test Documentation**: Clear results showing detection rate and patterns  

---

## Implementation Order
1. **PHASE 1** → Audit packages and enhance if needed
2. **PHASE 2** → Define hard requirements and success criteria per package
3. **PHASE 3** → Build test runner + assertion + aggregator
4. **PHASE 4** → Execute and document results
5. **PHASE 5** → Address gaps (if any)

---

## Notes
- Focus Phase 1 on getting packages "right" before running massive tests
- Consider interviewing real hiring managers about realistic violations
- May want to run initial pilot with 1-2 packages before full suite
