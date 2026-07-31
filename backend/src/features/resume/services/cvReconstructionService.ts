import { randomUUID } from 'crypto';
import { appLogger } from '../../../common/services/logger.js';
import { uploadBlob, deleteBlob, fetchBlobAsText } from '../../../common/services/s3Upload.js';

const BUCKET = 'optimized-cvs';

interface AcceptedBullet {
  originalBullet: string;
  optimizedBullet: string;
  userEdit?: string;
}

export class CvReconstructionService {

  /**
   * Takes the user's original resume text and replaces ONLY the
   * bullets the user accepted/edited, leaving everything else intact.
   *
   * The AI's `originalBullet` is derived from the structured resume
   * (verbatim bullets concatenated with spaces), so it rarely matches
   * the raw resume text byte-for-byte — there the bullets sit on
   * separate lines with list markers. We therefore try, in order:
   *   1. an exact substring replace (preserves layout perfectly),
   *   2. a normalized match that ignores whitespace, punctuation and
   *      case differences but maps back to the real text for the swap,
   *   3. appending any change we still could not locate, so an accepted
   *      edit is never silently lost from the final document.
   */
  static applyAcceptedChanges(
    originalText: string,
    acceptedBullets: AcceptedBullet[]
  ): string {
    let result = originalText;
    const unmatched: string[] = [];

    for (const bullet of acceptedBullets) {
      const replacement = (bullet.userEdit || bullet.optimizedBullet || '').trim();
      const search = (bullet.originalBullet || '').trim();
      if (!replacement || !search) continue;

      if (result.includes(search)) {
        result = result.replace(search, replacement);
        continue;
      }

      const normalized = this.replaceNormalized(result, search, replacement);
      if (normalized !== null) {
        result = normalized;
        continue;
      }

      unmatched.push(replacement);
    }

    if (unmatched.length > 0) {
      appLogger.warn('[CvReconstruction] Some accepted bullets could not be located in the original text; appending them', {
        count: unmatched.length,
      });
      const section = unmatched.map((line) => `- ${line}`).join('\n');
      result = `${result.replace(/\s+$/, '')}\n\nATS-Optimized Highlights\n${section}\n`;
    }

    return result;
  }

  /**
   * Locate `search` inside `text` ignoring differences in whitespace,
   * punctuation and case, then replace the matched region (mapped back
   * to the real characters) with `replacement`. Returns null if the
   * text cannot be confidently located.
   */
  private static replaceNormalized(
    text: string,
    search: string,
    replacement: string
  ): string | null {
    const isAlnum = (c: string): boolean => /[a-zA-Z0-9]/.test(c);

    // Build a normalized view of `text` plus a map back to real offsets.
    const normChars: string[] = [];
    const startOffsets: number[] = [];
    const endOffsets: number[] = [];
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (isAlnum(ch)) {
        normChars.push(ch.toLowerCase());
        startOffsets.push(i);
        endOffsets.push(i + 1);
        i += 1;
      } else {
        let j = i;
        while (j < text.length && !isAlnum(text[j])) j += 1;
        normChars.push(' ');
        startOffsets.push(i);
        endOffsets.push(j);
        i = j;
      }
    }
    const normText = normChars.join('');

    const normSearch = search
      .split('')
      .map((c) => (isAlnum(c) ? c.toLowerCase() : ' '))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normSearch) return null;

    const idx = normText.indexOf(normSearch);
    if (idx === -1) return null;

    const realStart = startOffsets[idx];
    const realEnd = endOffsets[idx + normSearch.length - 1];

    return text.slice(0, realStart) + replacement + text.slice(realEnd);
  }

  /**
   * Build the final CV, upload to MinIO, and return the key.
   */
  static async storeArtifact(
    userId: string,
    cvText: string,
    versionTag: string
  ): Promise<{ artifactKey: string; downloadUrl: string }> {
    const artifactKey = `${userId}_${versionTag}_${randomUUID().slice(0, 8)}.md`;
    const { url } = await uploadBlob(artifactKey, cvText, 'text/markdown', BUCKET);

    appLogger.info('[CvReconstruction] Artifact stored', { userId, artifactKey, bytes: cvText.length });
    return { artifactKey, downloadUrl: url };
  }

  /**
   * Retrieve the reconstructed CV text from MinIO.
   */
  static async fetchArtifact(artifactKey: string): Promise<string> {
    return fetchBlobAsText(artifactKey, BUCKET);
  }

  /**
   * Delete the reconstructed CV blob from MinIO.
   */
  static async deleteArtifact(artifactKey: string): Promise<void> {
    await deleteBlob(artifactKey, BUCKET);
    appLogger.info('[CvReconstruction] Artifact deleted', { artifactKey });
  }
}
