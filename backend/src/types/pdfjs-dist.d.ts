/**
 * pdf.js ships its Node-compatible build without bundled types under this entry point.
 * Only the surface PdfProcessor uses is declared.
 */
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  interface TextItem {
    str?: string;
    hasEOL?: boolean;
  }

  interface TextContent {
    items: TextItem[];
  }

  interface PDFPageProxy {
    getTextContent(): Promise<TextContent>;
  }

  interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }

  interface PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>;
    destroy(): Promise<void>;
  }

  export function getDocument(params: Record<string, unknown>): PDFDocumentLoadingTask;
}
