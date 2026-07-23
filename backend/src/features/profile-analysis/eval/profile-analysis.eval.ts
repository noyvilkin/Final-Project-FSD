import "dotenv/config";
import { ResumeParsingService } from "../../resume/services/resumeParsingService.js";
import { PROFILE_ANALYSIS_EVAL_SAMPLES } from "./profile-analysis.eval.samples.js";
import type {
  EvalResult,
  FieldScore,
  ProfileAnalysisExpectedOutput
} from "./profile-analysis.eval.types.js";

type ActualProfileOutput = ProfileAnalysisExpectedOutput;

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function scoreExactField(
  field: string,
  actual: unknown,
  expected: unknown
): FieldScore {
  const actualNormalized = normalize(actual);
  const expectedNormalized = normalize(expected);

  if (actualNormalized === expectedNormalized) {
    return { field, score: 1, reason: "Exact match" };
  }

  if (!expectedNormalized && !actualNormalized) {
    return { field, score: 1, reason: "Both empty/null" };
  }

  if (
    expectedNormalized &&
    actualNormalized &&
    (actualNormalized.includes(expectedNormalized) ||
      expectedNormalized.includes(actualNormalized))
  ) {
    return {
      field,
      score: 0.5,
      reason: `Partial match. Expected "${expected}", got "${actual}"`
    };
  }

  return {
    field,
    score: 0,
    reason: `Expected "${expected}", got "${actual}"`
  };
}

function scoreBooleanField(
  field: string,
  actual: boolean,
  expected: boolean
): FieldScore {
  return actual === expected
    ? { field, score: 1, reason: "Boolean match" }
    : { field, score: 0, reason: `Expected ${expected}, got ${actual}` };
}

function scoreNullableNumberField(
  field: string,
  actual: number | null,
  expected: number | null
): FieldScore {
  if (actual === expected) {
    return { field, score: 1, reason: "Number/null match" };
  }

  if (typeof actual === "number" && typeof expected === "number") {
    const diff = Math.abs(actual - expected);

    if (diff <= 0.5) {
      return {
        field,
        score: 0.5,
        reason: `Close number. Expected ${expected}, got ${actual}`
      };
    }
  }

  return {
    field,
    score: 0,
    reason: `Expected ${expected}, got ${actual}`
  };
}

function scoreGradeAverageField(
  field: string,
  actual: number | null,
  expected: number | null
): FieldScore {
  if (actual === expected) {
    return { field, score: 1, reason: "Grade match" };
  }

  if (actual == null && expected == null) {
    return { field, score: 1, reason: "Both grades are null" };
  }

  if (actual == null || expected == null) {
    return {
      field,
      score: 0,
      reason: `Expected grade ${expected}, got ${actual}`
    };
  }

  const directDiff = Math.abs(actual - expected);

  if (directDiff <= 0.5) {
    return {
      field,
      score: 1,
      reason: `Close numeric grade match. Expected ${expected}, got ${actual}`
    };
  }

  // Handles converted GPA values.
  // Example: 94/100 may be returned as 3.76/4.0.
  const expectedAsGpa = expected / 25;
  const gpaDiff = Math.abs(actual - expectedAsGpa);

  if (gpaDiff <= 0.05) {
    return {
      field,
      score: 1,
      reason: `Equivalent GPA conversion accepted. Expected ${expected}, got ${actual}`
    };
  }

  // Handles the reverse case.
  // Example: expected 3.76, actual 94.
  const actualAsGpa = actual / 25;
  const reverseGpaDiff = Math.abs(actualAsGpa - expected);

  if (reverseGpaDiff <= 0.05) {
    return {
      field,
      score: 1,
      reason: `Equivalent reverse GPA conversion accepted. Expected ${expected}, got ${actual}`
    };
  }

  return {
    field,
    score: 0,
    reason: `Expected grade ${expected}, got ${actual}`
  };
}

function scoreListOverlap(
  field: string,
  actual: string[],
  expected: string[]
): FieldScore {
  if (expected.length === 0 && actual.length === 0) {
    return { field, score: 1, reason: "Both lists empty" };
  }

  if (expected.length === 0 && actual.length > 0) {
    return { field, score: 0, reason: "Expected empty list, got items" };
  }

  const actualSet = new Set(actual.map(normalize));
  const expectedSet = new Set(expected.map(normalize));

  let matches = 0;

  for (const item of expectedSet) {
    if (actualSet.has(item)) {
      matches += 1;
    }
  }

  const ratio = matches / expectedSet.size;

  if (ratio >= 0.8) {
    return {
      field,
      score: 1,
      reason: `${matches}/${expectedSet.size} expected items matched`
    };
  }

  if (ratio >= 0.4) {
    return {
      field,
      score: 0.5,
      reason: `${matches}/${expectedSet.size} expected items matched`
    };
  }

  return {
    field,
    score: 0,
    reason: `${matches}/${expectedSet.size} expected items matched`
  };
}

function scoreCourseRelevance(
  field: string,
  actual: string[],
  expected: string[]
): FieldScore {
  if (expected.length === 0 && actual.length === 0) {
    return { field, score: 1, reason: "Both course lists empty" };
  }

  if (!actual.length) {
    return { field, score: 0, reason: "No recommended courses returned" };
  }

  const expectedKeywords = expected
    .flatMap((course) => normalize(course).split(" "))
    .filter((word) => word.length > 3);

  const actualText = normalize(actual.join(" "));

  const matchedKeywords = expectedKeywords.filter((keyword) =>
    actualText.includes(keyword)
  );

  const uniqueExpectedKeywords = new Set(expectedKeywords);
  const uniqueMatchedKeywords = new Set(matchedKeywords);

  const ratio =
  uniqueMatchedKeywords.size / Math.max(uniqueExpectedKeywords.size, 1);

if (ratio >= 0.3) {
  return {
    field,
    score: 1,
    reason: `Relevant course recommendations returned (${actual.length} courses)`
  };
}

  if (ratio >= 0.15) {
    return {
      field,
      score: 0.5,
      reason: "Partially relevant course recommendations"
    };
  }

  return {
    field,
    score: 0,
    reason: "Courses are not sufficiently aligned with expected growth areas"
  };
}

function gradeFromPercentage(percentage: number): EvalResult["grade"] {
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B";
  if (percentage >= 70) return "C";
  if (percentage >= 60) return "D";
  return "F";
}

function evaluateOutput(
  actual: ActualProfileOutput,
  expected: ProfileAnalysisExpectedOutput
): FieldScore[] {
  return [
    scoreExactField("candidateName", actual.candidateName, expected.candidateName),
    scoreExactField("candidateEmail", actual.candidateEmail, expected.candidateEmail),

    scoreBooleanField(
      "profileSummary.hasDegree",
      actual.profileSummary.hasDegree,
      expected.profileSummary.hasDegree
    ),

    scoreExactField(
      "profileSummary.highestDegree",
      actual.profileSummary.highestDegree,
      expected.profileSummary.highestDegree
    ),

    scoreExactField(
      "profileSummary.fieldOfStudy",
      actual.profileSummary.fieldOfStudy,
      expected.profileSummary.fieldOfStudy
    ),

    scoreExactField(
      "profileSummary.institution",
      actual.profileSummary.institution,
      expected.profileSummary.institution
    ),

    scoreGradeAverageField(
      "profileSummary.gradeAverage",
      actual.profileSummary.gradeAverage,
      expected.profileSummary.gradeAverage
    ),

    scoreNullableNumberField(
      "profileSummary.totalYearsOfExperience",
      actual.profileSummary.totalYearsOfExperience,
      expected.profileSummary.totalYearsOfExperience
    ),

    scoreExactField(
      "profileSummary.lastRoleTitle",
      actual.profileSummary.lastRoleTitle,
      expected.profileSummary.lastRoleTitle
    ),

    scoreExactField(
      "profileSummary.lastRoleCompany",
      actual.profileSummary.lastRoleCompany,
      expected.profileSummary.lastRoleCompany
    ),

    scoreListOverlap(
      "profileSummary.topSkills",
      actual.profileSummary.topSkills,
      expected.profileSummary.topSkills
    ),

    scoreCourseRelevance(
      "profileSummary.recommendedCourses",
      actual.profileSummary.recommendedCourses,
      expected.profileSummary.recommendedCourses
    )
  ];
}

async function analyzeResumeProfileForEval(
  resumeText: string,
  expected: ProfileAnalysisExpectedOutput
): Promise<ActualProfileOutput> {
  void expected;

  const dna = await ResumeParsingService.extractDNAFromText(resumeText);

  return {
    candidateName: dna.candidateName,
    candidateEmail: dna.candidateEmail,
    profileSummary: {
      hasDegree: dna.profileSummary.hasDegree,
      highestDegree: dna.profileSummary.highestDegree ?? null,
      fieldOfStudy: dna.profileSummary.fieldOfStudy ?? null,
      institution: dna.profileSummary.institution ?? null,
      gradeAverage: dna.profileSummary.gradeAverage ?? null,
      totalYearsOfExperience: dna.profileSummary.totalYearsOfExperience ?? null,
      lastRoleTitle: dna.profileSummary.lastRoleTitle ?? null,
      lastRoleCompany: dna.profileSummary.lastRoleCompany ?? null,
      topSkills: dna.profileSummary.topSkills ?? [],
      recommendedCourses: dna.profileSummary.recommendedCourses ?? []
    }
  };
}

async function runEvaluation(): Promise<void> {
  const only = process.env.EVAL_ONLY?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const samples = only?.length
    ? PROFILE_ANALYSIS_EVAL_SAMPLES.filter((sample) => only.includes(sample.id))
    : PROFILE_ANALYSIS_EVAL_SAMPLES;

  if (samples.length === 0) {
    console.log("No evaluation samples matched EVAL_ONLY filter.");
    return;
  }

  const results: EvalResult[] = [];

  for (const sample of samples) {
    const actual = await analyzeResumeProfileForEval(sample.resumeText, sample.expected);

    console.log("\nGenerated output:");
    console.dir(actual, { depth: null });

    const fieldScores = evaluateOutput(actual, sample.expected);

    const totalScore = fieldScores.reduce((sum, item) => sum + item.score, 0);
    const maxScore = fieldScores.length;
    const percentage = Math.round((totalScore / maxScore) * 100);

    results.push({
      sampleId: sample.id,
      description: sample.description,
      totalScore,
      maxScore,
      percentage,
      grade: gradeFromPercentage(percentage),
      fieldScores
    });
  }

  console.log("\nResume Profile Analysis Evaluation\n");

  for (const result of results) {
    console.log(`${result.sampleId} - ${result.description}`);
    console.log(
      `Score: ${result.totalScore}/${result.maxScore} (${result.percentage}%) Grade: ${result.grade}`
    );

    for (const fieldScore of result.fieldScores) {
      const icon =
        fieldScore.score === 1 ? "✅" : fieldScore.score === 0.5 ? "⚠️" : "❌";

      console.log(
        `  ${icon} ${fieldScore.field}: ${fieldScore.score} - ${fieldScore.reason}`
      );
    }

    console.log("");
  }

  const avg =
    results.reduce((sum, result) => sum + result.percentage, 0) /
    Math.max(results.length, 1);

  console.log(`Average score: ${Math.round(avg)}%`);
}

runEvaluation().catch((error) => {
  console.error("Profile analysis evaluation failed");
  console.error(error);
  process.exit(1);
});