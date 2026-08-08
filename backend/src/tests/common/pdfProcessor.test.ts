/**
 * Covers the assignment-brief extraction path. These cases previously slipped through:
 * a whitespace-only PDF was reported as a successful extraction with an empty rubric, and
 * normalization deleted lines that introduce the requirements the grader scores against.
 */

const mockPdfParse = jest.fn();

jest.mock("pdf-parse/lib/pdf-parse.js", () => ({
  __esModule: true,
  default: (buffer: Buffer) => mockPdfParse(buffer),
}));

jest.mock("../../common/services/logger.js", () => ({
  appLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { PdfProcessor } from "../../common/utils/pdfProcessor.js";

const buffer = Buffer.from("%PDF-1.4 fake");

/** Builds a pdf-parse style payload. */
function pdfText(text: string, numpages = 1) {
  return { text, numpages };
}

beforeEach(() => {
  mockPdfParse.mockReset();
});

describe("PdfProcessor.extractTextFromPdf", () => {
  test("extracts and normalizes a well-formed assignment brief", async () => {
    mockPdfParse.mockResolvedValue(
      pdfText(
        "\n\nHard Requirements: \n" +
          "- Use Node.js and Express to implement a REST API \n" +
          "- Use PostgreSQL as the primary datastore \n"
      )
    );

    const result = await PdfProcessor.extractTextFromPdf(buffer);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.normalizedText).toContain("Hard Requirements:");
    expect(result.normalizedText).toContain(
      "• Use Node.js and Express to implement a REST API"
    );
    expect(result.normalizedText).toContain("• Use PostgreSQL as the primary datastore");
  });

  test("fails when the PDF yields only whitespace instead of reporting success", async () => {
    // pdfjs returns "\n\n" for image-only or partially recovered files. The old
    // length-based check passed this through, so the grader ran on an empty rubric.
    mockPdfParse.mockResolvedValue(pdfText("\n\n"));

    const result = await PdfProcessor.extractTextFromPdf(buffer);

    expect(result.success).toBe(false);
    expect(result.normalizedText).toBe("");
    expect(result.errors.join(" ")).toMatch(/no text content/i);
  });

  test("fails when normalization consumes the entire document", async () => {
    mockPdfParse.mockResolvedValue(pdfText("1\n2\nPage 3 of 7\n"));

    const result = await PdfProcessor.extractTextFromPdf(buffer);

    expect(result.success).toBe(false);
    expect(result.errors.join(" ")).toMatch(/no usable text/i);
  });

  test("reports failure when the PDF is corrupt", async () => {
    mockPdfParse.mockRejectedValue(new Error("bad XRef entry"));

    const result = await PdfProcessor.extractTextFromPdf(buffer);

    expect(result.success).toBe(false);
    expect(result.extractedText).toBe("");
    expect(result.errors.join(" ")).toContain("bad XRef entry");
  });

  test("keeps requirement lines that begin with brief-heading words", async () => {
    // These were stripped as "headers", silently truncating the rubric.
    mockPdfParse.mockResolvedValue(
      pdfText(
        "Assignment: pkg-05\n" +
          "Requirements: the service must expose GET /health returning 200.\n" +
          "Task 2: implement JWT authentication.\n" +
          "Project must include unit tests.\n"
      )
    );

    const result = await PdfProcessor.extractTextFromPdf(buffer);

    expect(result.success).toBe(true);
    expect(result.normalizedText).toContain("Assignment: pkg-05");
    expect(result.normalizedText).toContain("GET /health returning 200");
    expect(result.normalizedText).toContain("Task 2: implement JWT authentication.");
    expect(result.normalizedText).toContain("Project must include unit tests.");
  });

  test("keeps a numbered requirement that ends in a number", async () => {
    // The old "simple numbered ToC" pattern matched these and deleted them.
    mockPdfParse.mockResolvedValue(
      pdfText("1. Return HTTP 200\n2. Support a page size of 50\n")
    );

    const result = await PdfProcessor.extractTextFromPdf(buffer);

    expect(result.normalizedText).toContain("Return HTTP 200");
    expect(result.normalizedText).toContain("Support a page size of 50");
  });

  test("keeps prose containing the word 'contents'", async () => {
    // The old bare /contents/ pattern deleted from the match to the next blank line.
    mockPdfParse.mockResolvedValue(
      pdfText(
        "Requirements:\n" +
          "- GET /cart returns the contents of the cart\n" +
          "- DELETE /cart empties it\n"
      )
    );

    const result = await PdfProcessor.extractTextFromPdf(buffer);

    expect(result.normalizedText).toContain("returns the contents of the cart");
    expect(result.normalizedText).toContain("DELETE /cart empties it");
  });

  test("still strips page furniture", async () => {
    mockPdfParse.mockResolvedValue(
      pdfText(
        "Requirements: implement the API.\n" +
          "Page 2\n" +
          "3 of 7\n" +
          "© 2024 Example College\n" +
          "- Use PostgreSQL\n"
      )
    );

    const result = await PdfProcessor.extractTextFromPdf(buffer);

    expect(result.normalizedText).toContain("Requirements: implement the API.");
    expect(result.normalizedText).toContain("• Use PostgreSQL");
    expect(result.normalizedText).not.toContain("Page 2");
    expect(result.normalizedText).not.toContain("3 of 7");
    expect(result.normalizedText).not.toContain("Example College");
  });

  test("reports page count and lengths for a successful extraction", async () => {
    mockPdfParse.mockResolvedValue(pdfText("Requirements: build the thing.\n", 4));

    const result = await PdfProcessor.extractTextFromPdf(buffer);

    expect(result.metadata.totalPages).toBe(4);
    expect(result.metadata.originalLength).toBeGreaterThan(0);
    expect(result.metadata.normalizedLength).toBe(result.normalizedText.length);
  });
});
