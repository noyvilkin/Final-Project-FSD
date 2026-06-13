import path from 'path';
import fs from 'fs';
import { ZipProcessor } from '../../common/utils/zipProcessor.js';

describe('ZipProcessor.scanZipFile', () => {
  const PACKAGES_BASE = path.join(
    __dirname,
    '..',
    '..',
    'features',
    'assignment',
    'tests',
    'faulty-packages'
  );

  test('filters noise and returns only source files for package-01', async () => {
    const zipPath = path.join(PACKAGES_BASE, 'package-01', 'package-01.zip');
    expect(fs.existsSync(zipPath)).toBe(true);

    const buffer = fs.readFileSync(zipPath);
    const result = await ZipProcessor.scanZipFile(buffer);

    expect(result.isValid).toBe(true);
    expect(result.sourceFiles.length).toBeGreaterThan(0);

    const nonSource = result.sourceFiles.filter(f =>
      /node_modules|\.git|dist|build|\.idea|\.vscode/i.test(f.path)
    );
    expect(nonSource.length).toBe(0);

    for (const sf of result.sourceFiles) {
      expect(sf.language).toBeTruthy();
      expect(typeof sf.content).toBe('string');
    }
  });

  test('handles a good package and computes project scope', async () => {
    const zipPath = path.join(PACKAGES_BASE, 'package-06-good', 'package-06-good.zip');
    expect(fs.existsSync(zipPath)).toBe(true);

    const buffer = fs.readFileSync(zipPath);
    const result = await ZipProcessor.scanZipFile(buffer);

    expect(result.isValid).toBe(true);
    expect(result.sourceFiles.length).toBeGreaterThanOrEqual(1);
    expect(result.totalSourceSize).toBeGreaterThan(0);
    expect(['small', 'medium', 'large']).toContain(result.projectScope);
  });
});

export {};
