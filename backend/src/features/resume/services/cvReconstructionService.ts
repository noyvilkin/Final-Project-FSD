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
   */
  static applyAcceptedChanges(
    originalText: string,
    acceptedBullets: AcceptedBullet[]
  ): string {
    let result = originalText;

    for (const bullet of acceptedBullets) {
      const replacement = bullet.userEdit || bullet.optimizedBullet;
      if (result.includes(bullet.originalBullet)) {
        result = result.replace(bullet.originalBullet, replacement);
      }
    }

    return result;
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
