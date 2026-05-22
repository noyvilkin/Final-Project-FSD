import { ZipProcessor } from '../../common/utils/zipProcessor.js';

describe('ZipProcessor noise and source detection', () => {
  const proc: any = ZipProcessor as any;

  test('identifies noise paths correctly', () => {
    const noisePaths = [
      'node_modules/express/index.js',
      '.git/config',
      'dist/app.bundle.js',
      'coverage/lcov.info',
      'logs/error.log',
      'vendor/some/lib.js',
    ];

    for (const p of noisePaths) {
      expect(proc.isNoiseFile(p)).toBe(true);
    }
  });

  test('does not mark source files as noise', () => {
    const sourceLike = [
      'src/index.js',
      'lib/module.ts',
      'app/main.py',
      'Dockerfile',
      'Makefile',
    ];

    for (const p of sourceLike) {
      expect(proc.isNoiseFile(p)).toBe(false);
    }
  });

  test('detects source file extensions and languages', () => {
    expect(proc.detectLanguageFromExtension('.js')).toBe('javascript');
    expect(proc.detectLanguageFromExtension('.ts')).toBe('typescript');
    expect(proc.detectLanguageFromExtension('.py')).toBe('python');
    expect(proc.detectLanguageFromExtension('.unknown')).toBeNull();
  });

  test('isSourceFile returns true for known source files', () => {
    expect(proc.isSourceFile('src/app.js')).toBe(true);
    expect(proc.isSourceFile('Dockerfile')).toBe(true);
    expect(proc.isSourceFile('Makefile')).toBe(true);
    expect(proc.isSourceFile('README.md')).toBe(false);
  });
});
