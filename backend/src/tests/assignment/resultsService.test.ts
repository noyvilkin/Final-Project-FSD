import { ResultsService } from "../../features/assignment/services/resultsService.js";

describe("ResultsService.getPerformanceLevel", () => {
  test.each([
    [100, "Excellent"],
    [90, "Excellent"],
    [89, "Good"],
    [80, "Good"],
    [79, "Satisfactory"],
    [70, "Satisfactory"],
    [69, "Needs Improvement"],
    [60, "Needs Improvement"],
    [59, "Poor"],
    [0, "Poor"],
  ])("maps a score of %i to '%s'", (score, expected) => {
    expect(ResultsService.getPerformanceLevel(score)).toBe(expected);
  });
});
