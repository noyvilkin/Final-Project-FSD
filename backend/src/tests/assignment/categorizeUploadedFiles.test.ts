// AssignmentService imports s3Upload, which throws at import time unless S3 env
// vars are set. categorizeUploadedFiles is pure and needs none of that, so we
// stub the S3 module.
jest.mock("../../common/services/s3Upload.js", () => ({
  fetchBlobAsBuffer: jest.fn(),
  deleteBlob: jest.fn(),
}));

// assignmentAnalysisService pulls in pdfProcessor (createRequire/import.meta),
// which ts-jest can't compile and is irrelevant to this pure helper.
jest.mock("../../features/assignment/services/assignmentAnalysisService.js", () => ({
  AssignmentAnalysisService: {},
}));

import { AssignmentService, type UploadedFile } from "../../features/assignment/services/assignmentService.js";

const makeFile = (key: string): UploadedFile => ({
  bucket: "test-bucket",
  key,
  url: `https://example.com/${key}`,
  mimeType: "application/octet-stream",
  size: 100,
});

describe("AssignmentService.categorizeUploadedFiles", () => {
  test("detects requirement files by the 'requirement' keyword", () => {
    const result = AssignmentService.categorizeUploadedFiles([
      makeFile("uuid-requirement-assignment.pdf"),
      makeFile("uuid-solution-code.zip"),
    ]);

    expect(result.requirements?.key).toContain("requirement");
    expect(result.solution?.key).toContain("solution");
  });

  test("detects requirement files by the 'spec' keyword", () => {
    const result = AssignmentService.categorizeUploadedFiles([makeFile("uuid-spec.pdf")]);
    expect(result.requirements?.key).toBe("uuid-spec.pdf");
    expect(result.solution).toBeUndefined();
  });

  test("detects solution files by 'solution', 'code', or 'main'", () => {
    expect(AssignmentService.categorizeUploadedFiles([makeFile("solution.zip")]).solution?.key).toBe("solution.zip");
    expect(AssignmentService.categorizeUploadedFiles([makeFile("code.zip")]).solution?.key).toBe("code.zip");
    expect(AssignmentService.categorizeUploadedFiles([makeFile("main.zip")]).solution?.key).toBe("main.zip");
  });

  test("falls back to the first unlabeled file as the solution", () => {
    const result = AssignmentService.categorizeUploadedFiles([makeFile("archive.zip")]);
    expect(result.solution?.key).toBe("archive.zip");
    expect(result.requirements).toBeUndefined();
  });

  test("keeps the first unlabeled file as solution and does not overwrite it", () => {
    const result = AssignmentService.categorizeUploadedFiles([
      makeFile("first.zip"),
      makeFile("second.zip"),
    ]);
    expect(result.solution?.key).toBe("first.zip");
  });

  test("is case-insensitive on keywords", () => {
    const result = AssignmentService.categorizeUploadedFiles([makeFile("MY-REQUIREMENT.PDF")]);
    expect(result.requirements?.key).toBe("MY-REQUIREMENT.PDF");
  });

  test("returns an empty object for no files", () => {
    expect(AssignmentService.categorizeUploadedFiles([])).toEqual({});
  });
});
