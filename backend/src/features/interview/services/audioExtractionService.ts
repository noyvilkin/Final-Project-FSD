import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { mkdir, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { appLogger } from '../../../common/services/logger.js';

// Point fluent-ffmpeg at the bundled binary so no system ffmpeg is required.
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const CAREERPILOT_TMP_DIR = join(tmpdir(), 'careerpilot');

/** Audio formats Whisper accepts. */
const WHISPER_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'audio/x-flac',
]);

export interface AudioExtractionResult {
  /** Absolute path to the audio file on disk. Caller is responsible for cleanup. */
  audioPath: string;
  /** Whether a new file was extracted (false = original path was returned as-is). */
  extracted: boolean;
}

export class AudioExtractionService {
  /**
   * Given a local media file path, return a path to a suitable audio file.
   *
   * - If the file is already a Whisper-compatible audio format, the original
   *   path is returned and `extracted` is false — no copy is made.
   * - If the file is a video (or an unsupported audio container), the audio
   *   track is extracted to an mp3 temp file and `extracted` is true.
   *
   * The caller must call `cleanupAudioFile` on `audioPath` when `extracted`
   * is true.
   */
  static async extractAudio(
    inputPath: string,
    mimeType: string
  ): Promise<AudioExtractionResult> {
    if (WHISPER_AUDIO_MIME_TYPES.has(mimeType)) {
      appLogger.info('[AudioExtractionService] File is already a supported audio format', { mimeType });
      return { audioPath: inputPath, extracted: false };
    }

    appLogger.info('[AudioExtractionService] Extracting audio from media file', {
      inputPath,
      mimeType,
    });

    await mkdir(CAREERPILOT_TMP_DIR, { recursive: true });
    const outputPath = join(CAREERPILOT_TMP_DIR, `${randomUUID()}.mp3`);

    await AudioExtractionService.runFfmpeg(inputPath, outputPath);

    appLogger.info('[AudioExtractionService] Audio extracted', { outputPath });
    return { audioPath: outputPath, extracted: true };
  }

  /**
   * Remove a temp audio file produced by `extractAudio`.
   * Safe to call even if the file no longer exists.
   */
  static async cleanupAudioFile(audioPath: string): Promise<void> {
    try {
      await unlink(audioPath);
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'ENOENT') {
        appLogger.warn('[AudioExtractionService] Failed to delete temp audio file', {
          audioPath,
          error: nodeErr.message,
        });
      }
    }
  }

  // ── private ──────────────────────────────────────────────────────────────

  private static runFfmpeg(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          reject(new Error(`[AudioExtractionService] ffmpeg failed: ${err.message}`));
        })
        .run();
    });
  }
}
