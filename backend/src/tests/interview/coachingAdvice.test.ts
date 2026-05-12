import type { GeminiClient } from "../../common/services/geminiClient.js";
import { generateCoaching } from "../../features/interview/services/coachingAdvice.js";

function makeMockGemini(response: string): GeminiClient {
  return {
    generate: jest.fn().mockResolvedValue(response),
  } as unknown as GeminiClient;
}

const baseArgs = {
  transcript: "I led the migration to TypeScript.",
  analyzers: {},
  readiness: {
    readinessScore: 70,
    breakdown: { technical: 80, behavioral: 60, communication: 65 },
  },
};

describe("generateCoaching", () => {
  it("parses a clean response into the IC oachingOutput shape", async () => {
    const gemini = makeMockGemini(JSON.stringify({
      tips: [
        {
          type:       "behavioral",
          issue:      "No quantified results.",
          suggestion: "Add a metric showing impact.",
        },
        {
          type:             "verbal",
          issue:            "Several 'um' fillers in the middle.",
          suggestion:       "Pause instead of filling.",
          exampleRewording: "We migrated the codebase and shipped on time.",
        },
      ],
    }));

    const result = await generateCoaching({ ...baseArgs, gemini });

    expect(result.tips).toHaveLength(2);
    expect(result.tips[0].type).toBe("behavioral");
    expect(result.tips[1].exampleRewording).toContain("migrated");
    expect(result.promptVersion).toBe("v1");
  });

  it("rejects more than 5 tips (Zod max constraint)", async () => {
    const tooMany = {
      tips: Array.from({ length: 6 }, (_, i) => ({
        type:       "technical",
        issue:      `issue ${i}`,
        suggestion: `fix ${i}`,
      })),
    };
    const gemini = makeMockGemini(JSON.stringify(tooMany));

    await expect(generateCoaching({ ...baseArgs, gemini })).rejects.toThrow(
      /schema validation failed/
    );
  });

  it("rejects unknown tip type", async () => {
    const gemini = makeMockGemini(JSON.stringify({
      tips: [{ type: "smell", issue: "x", suggestion: "y" }],
    }));
    await expect(generateCoaching({ ...baseArgs, gemini })).rejects.toThrow(
      /schema validation failed/
    );
  });

  it("strips ```json fences before parsing", async () => {
    const gemini = makeMockGemini(
      "```json\n" +
      JSON.stringify({ tips: [{ type: "verbal", issue: "x", suggestion: "y" }] }) +
      "\n```"
    );
    const result = await generateCoaching({ ...baseArgs, gemini });
    expect(result.tips).toHaveLength(1);
  });
});
