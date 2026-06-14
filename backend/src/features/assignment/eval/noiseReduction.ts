/** Audits ZipProcessor: every noise/non-source path must NOT appear in sourceFiles. */

import type { ZipScanResult } from '../../../common/utils/zipProcessor.js';

export interface NoiseReductionResult {
  packageId: string;
  totalEntries: number;
  sourceCount: number;
  noiseCount: number;
  nonSourceCount: number;
  filteredCorrectly: number;
  leakedPaths: string[];
  noiseReductionRate: number;
}

export function checkNoiseReduction(
  packageId: string,
  scan: ZipScanResult
): NoiseReductionResult {
  const sourcePaths = new Set(scan.sourceFiles.map((f) => f.path));

  // Sanity: nothing in the "ignored" lists should also be a source file.
  const leakedPaths: string[] = [];
  for (const p of scan.noiseFilesIgnored) {
    if (sourcePaths.has(p)) leakedPaths.push(p);
  }
  for (const p of scan.nonSourceFilesIgnored) {
    if (sourcePaths.has(p)) leakedPaths.push(p);
  }

  const noiseCount = scan.noiseFilesIgnored.length;
  const nonSourceCount = scan.nonSourceFilesIgnored.length;
  const totalToFilter = noiseCount + nonSourceCount;
  const filteredCorrectly = totalToFilter - leakedPaths.length;

  const noiseReductionRate =
    totalToFilter === 0 ? 1 : filteredCorrectly / totalToFilter;

  return {
    packageId,
    totalEntries: scan.totalFiles,
    sourceCount: scan.sourceFiles.length,
    noiseCount,
    nonSourceCount,
    filteredCorrectly,
    leakedPaths,
    noiseReductionRate,
  };
}
