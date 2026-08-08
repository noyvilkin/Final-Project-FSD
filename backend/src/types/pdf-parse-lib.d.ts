/**
 * pdf-parse ships types for its package root only. The implementation is imported from
 * lib/ to avoid the root entry point's debug block (see pdfProcessor.loadPdfParse).
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }

  function pdf(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PdfParseResult>;

  export = pdf;
}
