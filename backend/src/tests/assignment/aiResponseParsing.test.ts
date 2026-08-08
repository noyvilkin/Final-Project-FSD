import { AIAnalysisService } from "../../features/assignment/services/aiAnalysisService.js";

const validResponse = {
  codeQuality: { score: 85, strengths: ["clean structure"], weaknesses: ["long functions"] },
  functionalCorrectness: { score: 70, meetsRequirements: true, missingFeatures: [] },
  bestPractices: { score: 60, followsConventions: true, suggestions: ["add tests"] },
  overall: { score: 73, grade: "C", summary: "Solid, working solution." },
};

describe("AIAnalysisService.tryParseAIResponse", () => {
  test("parses a well-formed JSON response", () => {
    const result = AIAnalysisService.tryParseAIResponse(JSON.stringify(validResponse));

    expect(result).not.toBeNull();
    expect(result?.codeQuality.score).toBe(85);
    expect(result?.functionalCorrectness.meetsRequirements).toBe(true);
    expect(result?.overall.grade).toBe("C");
    expect(result?.bestPractices.suggestions).toEqual(["add tests"]);
  });

  test("strips ```json markdown fences before parsing", () => {
    const fenced = "```json\n" + JSON.stringify(validResponse) + "\n```";
    const result = AIAnalysisService.tryParseAIResponse(fenced);

    expect(result).not.toBeNull();
    expect(result?.overall.score).toBe(73);
  });

  test("repairs trailing commas", () => {
    const withTrailingCommas = `{
      "codeQuality": { "score": 80, "strengths": ["a",], "weaknesses": [] },
      "functionalCorrectness": { "score": 75, "meetsRequirements": true, "missingFeatures": [] },
      "bestPractices": { "score": 70, "followsConventions": true, "suggestions": [] },
      "overall": { "score": 76, "grade": "C", "summary": "ok", }
    }`;

    const result = AIAnalysisService.tryParseAIResponse(withTrailingCommas);

    expect(result).not.toBeNull();
    expect(result?.codeQuality.score).toBe(80);
  });

  test("extracts the JSON object when surrounded by prose", () => {
    const noisy = `Here is my analysis:\n${JSON.stringify(validResponse)}\nHope that helps!`;
    const result = AIAnalysisService.tryParseAIResponse(noisy);

    expect(result).not.toBeNull();
    expect(result?.overall.grade).toBe("C");
  });

  test("coerces wrong-typed fields to safe defaults", () => {
    const malformedTypes = {
      codeQuality: { score: "90", strengths: "not-an-array", weaknesses: [] },
      functionalCorrectness: { score: 50, meetsRequirements: "yes", missingFeatures: null },
      bestPractices: { score: 40, followsConventions: 0, suggestions: [] },
      overall: { score: "65", grade: "D+", summary: "coerced" },
    };

    const result = AIAnalysisService.tryParseAIResponse(JSON.stringify(malformedTypes));

    expect(result).not.toBeNull();
    expect(result?.codeQuality.score).toBe(90); // "90" -> 90
    expect(result?.codeQuality.strengths).toEqual([]); // non-array -> []
    expect(result?.functionalCorrectness.meetsRequirements).toBe(true); // "yes" -> true
    expect(result?.functionalCorrectness.missingFeatures).toEqual([]); // null -> []
    expect(result?.bestPractices.followsConventions).toBe(false); // 0 -> false
    expect(result?.overall.score).toBe(65);
  });

  test("overrides a letter grade that contradicts overall.score", () => {
    const inconsistent = {
      ...validResponse,
      overall: { score: 45, grade: "D+", summary: "wrong-stack solution" },
    };

    const result = AIAnalysisService.tryParseAIResponse(JSON.stringify(inconsistent));

    expect(result?.overall.score).toBe(45);
    expect(result?.overall.grade).toBe("F");
  });

  test("returns null when a required section is missing", () => {
    const { overall, ...missingOverall } = validResponse;
    void overall;
    expect(AIAnalysisService.tryParseAIResponse(JSON.stringify(missingOverall))).toBeNull();
  });

  test("returns null for non-JSON garbage", () => {
    expect(AIAnalysisService.tryParseAIResponse("the model refused to answer")).toBeNull();
    expect(AIAnalysisService.tryParseAIResponse("")).toBeNull();
  });
});

describe("AIAnalysisService.parseAIResponse", () => {
  test("returns parsed feedback for valid input", () => {
    const result = AIAnalysisService.parseAIResponse(JSON.stringify(validResponse));
    expect(result?.overall.grade).toBe("C");
  });

  test("falls back to a failure structure for unrecoverable input", () => {
    const result = AIAnalysisService.parseAIResponse("not json at all");

    expect(result?.overall.grade).toBe("F");
    expect(result?.overall.score).toBe(0);
    expect(result?.codeQuality.weaknesses).toContain("Failed to parse AI analysis");
  });
});
