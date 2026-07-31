// AssignmentService imports s3Upload, which throws at import time unless S3 env
// vars are set. roleFromUploadName is pure and needs none of that, so we stub
// the S3 module.
jest.mock("../../common/services/s3Upload.js", () => ({
  fetchBlobAsBuffer: jest.fn(),
  deleteBlob: jest.fn(),
}));

// assignmentAnalysisService pulls in pdfProcessor (createRequire/import.meta),
// which ts-jest can't compile and is irrelevant to this pure helper.
jest.mock("../../features/assignment/services/assignmentAnalysisService.js", () => ({
  AssignmentAnalysisService: {},
}));

import { AssignmentService } from "../../features/assignment/services/assignmentService.js";

describe("AssignmentService.roleFromUploadName", () => {
  test("maps the 'requirement-' prefix to the requirements role", () => {
    expect(AssignmentService.roleFromUploadName("requirement-assignment.pdf")).toBe("requirements");
  });

  test("maps the 'solution-' prefix to the solution role", () => {
    expect(AssignmentService.roleFromUploadName("solution-package-06-good.zip")).toBe("solution");
  });

  test("is case-insensitive on the prefix", () => {
    expect(AssignmentService.roleFromUploadName("REQUIREMENT-Spec.PDF")).toBe("requirements");
    expect(AssignmentService.roleFromUploadName("Solution-Main.zip")).toBe("solution");
  });

  test("returns null when no known role prefix is present", () => {
    expect(AssignmentService.roleFromUploadName("archive.zip")).toBeNull();
    expect(AssignmentService.roleFromUploadName("code.zip")).toBeNull();
    expect(AssignmentService.roleFromUploadName("main.js")).toBeNull();
    expect(AssignmentService.roleFromUploadName("")).toBeNull();
  });

  test("only matches the prefix, not the middle of the name", () => {
    // A solution file that merely mentions "requirement" is still a solution.
    expect(AssignmentService.roleFromUploadName("solution-requirement-notes.zip")).toBe("solution");
  });
});
