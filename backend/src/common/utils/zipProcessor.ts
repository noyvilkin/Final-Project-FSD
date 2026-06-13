import { extname, basename } from 'node:path';
import yauzl from 'yauzl';
import { appLogger } from '../services/logger.js';

// File size limits
const MAX_ZIP_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_EXTRACTED_SIZE_BYTES = 10 * 1024 * 1024; // 10MB total extracted content
const MAX_FILE_COUNT = 100;

// Noise directories and files to ignore
const NOISE_PATTERNS = [
  // Dependencies and build artifacts
  'node_modules',
  'bower_components',
  'vendor',
  'packages',
  '.git',
  '.svn',
  '.hg',
  
  // Build and distribution directories
  'dist',
  'build',
  'out',
  'target',
  'bin',
  'obj',
  'release',
  'debug',
  '.gradle',
  '.maven',
  
  // IDE and editor files
  '.vscode',
  '.idea',
  '.vs',
  '*.xcworkspace',
  '*.xcodeproj',
  
  // Testing and coverage
  'coverage',
  '.nyc_output',
  'test-results',
  'reports',
  
  // Cache and temporary files
  '.cache',
  '.tmp',
  'tmp',
  'temp',
  '.DS_Store',
  'Thumbs.db',
  
  // Log files
  '*.log',
  'logs'
];

// Source file extensions by language
const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  typescript: ['.ts', '.tsx'],
  python: ['.py', '.pyi', '.pyx'],
  java: ['.java'],
  csharp: ['.cs'],
  cpp: ['.cpp', '.cc', '.cxx', '.c++', '.c', '.h', '.hpp', '.hh'],
  go: ['.go'],
  rust: ['.rs'],
  php: ['.php'],
  ruby: ['.rb'],
  swift: ['.swift'],
  kotlin: ['.kt', '.kts'],
  scala: ['.scala'],
  dart: ['.dart'],
  html: ['.html', '.htm'],
  css: ['.css', '.scss', '.sass', '.less'],
  sql: ['.sql'],
  shell: ['.sh', '.bash', '.zsh'],
  powershell: ['.ps1'],
  yaml: ['.yml', '.yaml'],
  json: ['.json'],
  xml: ['.xml'],
  dockerfile: ['Dockerfile', '.dockerfile'],
  config: ['.cfg', '.conf', '.ini', '.env']
};

export interface SourceFile {
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface ZipScanResult {
  isValid: boolean;
  totalFiles: number;
  sourceFiles: SourceFile[];
  detectedLanguage: string | null;
  projectScope: 'small' | 'medium' | 'large';
  totalSourceSize: number;
  errors: string[];
  /** Paths skipped because they matched NOISE_PATTERNS (node_modules, .git, dist, …). */
  noiseFilesIgnored: string[];
  /** Paths skipped because they aren't recognized source files (README.md, *.lock, …). */
  nonSourceFilesIgnored: string[];
  metadata: {
    hasPackageJson: boolean;
    hasReadme: boolean;
    hasGitRepo: boolean;
    mainLanguageConfidence: number;
    frameworks: string[];
  };
}

export class ZipProcessor {
  private static isNoiseFile(path: string): boolean {
    const normalizedPath = path.toLowerCase();
    const pathSegments = normalizedPath.split('/');
    
    return NOISE_PATTERNS.some(pattern => {
      // Check if any path segment matches the pattern
      if (!pattern.includes('*')) {
        return pathSegments.some(segment => segment === pattern.toLowerCase());
      }
      
      // Handle wildcard patterns
      const regex = new RegExp(pattern.replace('*', '.*'));
      return pathSegments.some(segment => regex.test(segment)) || regex.test(basename(normalizedPath));
    });
  }

  private static detectLanguageFromExtension(extension: string): string | null {
    for (const [language, extensions] of Object.entries(LANGUAGE_EXTENSIONS)) {
      if (extensions.includes(extension.toLowerCase())) {
        return language;
      }
    }
    return null;
  }

  private static isSourceFile(path: string): boolean {
    const ext = extname(path);
    const filename = basename(path);
    
    // Check for special files without extensions
    if (['Dockerfile', 'Makefile', 'Rakefile', 'Gemfile', 'Podfile'].includes(filename)) {
      return true;
    }
    
    return this.detectLanguageFromExtension(ext) !== null;
  }

  private static analyzeProjectScope(sourceFiles: SourceFile[], totalFiles: number): 'small' | 'medium' | 'large' {
    const totalLoc = sourceFiles.reduce((acc, file) => {
      // Rough estimate: 1 line per 50 characters
      return acc + Math.ceil(file.content.length / 50);
    }, 0);

    if (totalFiles <= 10 && totalLoc <= 500) {
      return 'small';
    } else if (totalFiles <= 50 && totalLoc <= 2000) {
      return 'medium';
    } else {
      return 'large';
    }
  }

  private static detectPrimaryLanguage(sourceFiles: SourceFile[]): { language: string | null; confidence: number } {
    const languageStats = new Map<string, { count: number; totalSize: number }>();
    
    for (const file of sourceFiles) {
      const stats = languageStats.get(file.language) || { count: 0, totalSize: 0 };
      stats.count += 1;
      stats.totalSize += file.size;
      languageStats.set(file.language, stats);
    }

    if (languageStats.size === 0) {
      return { language: null, confidence: 0 };
    }

    // Calculate scores based on file count and total size
    let bestLanguage = '';
    let bestScore = 0;
    
    for (const [language, stats] of languageStats) {
      // Weight: 70% file count, 30% total size
      const score = (stats.count * 0.7) + (stats.totalSize / 1000 * 0.3);
      if (score > bestScore) {
        bestScore = score;
        bestLanguage = language;
      }
    }

    const totalFiles = sourceFiles.length;
    const dominantLanguageFiles = languageStats.get(bestLanguage)?.count || 0;
    const confidence = Math.min(1, dominantLanguageFiles / totalFiles);

    return { language: bestLanguage || null, confidence };
  }

  private static detectFrameworks(sourceFiles: SourceFile[]): string[] {
    const frameworks: string[] = [];
    const hasFile = (name: string) => sourceFiles.some(f => basename(f.path).toLowerCase() === name.toLowerCase());
    const hasFilePattern = (pattern: RegExp) => sourceFiles.some(f => pattern.test(f.path));
    
    // Package managers and frameworks
    if (hasFile('package.json')) {
      frameworks.push('npm', 'node.js');
    }
    if (hasFile('requirements.txt') || hasFile('setup.py') || hasFile('pyproject.toml')) {
      frameworks.push('python');
    }
    if (hasFile('pom.xml') || hasFile('build.gradle')) {
      frameworks.push('java');
    }
    if (hasFile('Cargo.toml')) {
      frameworks.push('rust');
    }
    if (hasFile('go.mod')) {
      frameworks.push('go');
    }
    if (hasFile('composer.json')) {
      frameworks.push('php');
    }
    if (hasFile('Gemfile')) {
      frameworks.push('ruby');
    }
    
    // Frontend frameworks (based on file patterns)
    if (hasFilePattern(/react|jsx/i)) {
      frameworks.push('react');
    }
    if (hasFilePattern(/vue/i)) {
      frameworks.push('vue');
    }
    if (hasFilePattern(/angular/i)) {
      frameworks.push('angular');
    }
    if (hasFile('next.config.js') || hasFilePattern(/next/i)) {
      frameworks.push('nextjs');
    }
    
    return [...new Set(frameworks)]; // Remove duplicates
  }

  static async validateZipFile(fileBuffer: Buffer): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check file size
    if (fileBuffer.length > MAX_ZIP_SIZE_BYTES) {
      errors.push(`ZIP file exceeds maximum size of ${MAX_ZIP_SIZE_BYTES / 1024 / 1024}MB`);
      return { isValid: false, errors };
    }

    try {
      // Quick validation: try to open the ZIP file
      await new Promise<void>((resolve, reject) => {
        yauzl.fromBuffer(fileBuffer, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            reject(new Error('Invalid ZIP file format'));
            return;
          }
          if (!zipfile) {
            reject(new Error('Unable to read ZIP file'));
            return;
          }
          zipfile.close();
          resolve();
        });
      });

      return { isValid: true, errors: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown ZIP validation error';
      errors.push(message);
      return { isValid: false, errors };
    }
  }

  static async scanZipFile(fileBuffer: Buffer): Promise<ZipScanResult> {
    const result: ZipScanResult = {
      isValid: false,
      totalFiles: 0,
      sourceFiles: [],
      detectedLanguage: null,
      projectScope: 'small',
      totalSourceSize: 0,
      errors: [],
      noiseFilesIgnored: [],
      nonSourceFilesIgnored: [],
      metadata: {
        hasPackageJson: false,
        hasReadme: false,
        hasGitRepo: false,
        mainLanguageConfidence: 0,
        frameworks: []
      }
    };

    try {
      // First validate the ZIP file
      const validation = await this.validateZipFile(fileBuffer);
      if (!validation.isValid) {
        result.errors = validation.errors;
        return result;
      }

      const sourceFiles: SourceFile[] = [];
      let totalSourceSize = 0;
      let totalFiles = 0;

      await new Promise<void>((resolve, reject) => {
        yauzl.fromBuffer(fileBuffer, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            reject(err);
            return;
          }
          if (!zipfile) {
            reject(new Error('Unable to read ZIP file'));
            return;
          }

          const processedFiles: Promise<void>[] = [];

          zipfile.readEntry();

          zipfile.on('entry', (entry) => {
            if (entry.fileName.endsWith('/')) {
              zipfile.readEntry();
              return;
            }

            totalFiles++;

            if (this.isNoiseFile(entry.fileName)) {
              result.noiseFilesIgnored.push(entry.fileName);
              zipfile.readEntry();
              return;
            }

            // Check metadata files
            const filename = basename(entry.fileName).toLowerCase();
            if (filename === 'package.json') {
              result.metadata.hasPackageJson = true;
            }
            if (filename.startsWith('readme')) {
              result.metadata.hasReadme = true;
            }
            if (entry.fileName.includes('.git/')) {
              result.metadata.hasGitRepo = true;
            }

            // Process source files
            if (this.isSourceFile(entry.fileName)) {
              if (totalFiles > MAX_FILE_COUNT) {
                result.errors.push(`Too many files in ZIP. Maximum allowed: ${MAX_FILE_COUNT}`);
                zipfile.close();
                reject(new Error('File count limit exceeded'));
                return;
              }

              const filePromise = new Promise<void>((fileResolve, fileReject) => {
                zipfile.openReadStream(entry, (streamErr, readStream) => {
                  if (streamErr || !readStream) {
                    fileReject(streamErr || new Error('Unable to read file'));
                    return;
                  }

                  const chunks: Buffer[] = [];
                  readStream.on('data', (chunk) => chunks.push(chunk));
                  readStream.on('end', () => {
                    try {
                      const content = Buffer.concat(chunks).toString('utf-8');
                      const fileSize = content.length;

                      if (totalSourceSize + fileSize > MAX_EXTRACTED_SIZE_BYTES) {
                        result.errors.push(`Total extracted code exceeds maximum size of ${MAX_EXTRACTED_SIZE_BYTES / 1024 / 1024}MB`);
                        fileReject(new Error('Content size limit exceeded'));
                        return;
                      }

                      const language = this.detectLanguageFromExtension(extname(entry.fileName)) || 'unknown';
                      
                      sourceFiles.push({
                        path: entry.fileName,
                        content,
                        language,
                        size: fileSize
                      });

                      totalSourceSize += fileSize;
                      fileResolve();
                    } catch (error) {
                      appLogger.warn(`Failed to process file ${entry.fileName}:`, error);
                      fileResolve(); // Continue processing other files
                    }
                  });
                  readStream.on('error', fileReject);
                });
              });

              processedFiles.push(filePromise);
            } else {
              result.nonSourceFilesIgnored.push(entry.fileName);
            }

            zipfile.readEntry();
          });

          zipfile.on('end', async () => {
            try {
              await Promise.all(processedFiles);
              
              // Analyze results
              result.sourceFiles = sourceFiles;
              result.totalSourceSize = totalSourceSize;
              result.totalFiles = totalFiles;
              result.projectScope = this.analyzeProjectScope(sourceFiles, totalFiles);
              
              const languageDetection = this.detectPrimaryLanguage(sourceFiles);
              result.detectedLanguage = languageDetection.language;
              result.metadata.mainLanguageConfidence = languageDetection.confidence;
              result.metadata.frameworks = this.detectFrameworks(sourceFiles);
              
              result.isValid = sourceFiles.length > 0;
              if (sourceFiles.length === 0) {
                result.errors.push('No source files found in ZIP archive');
              }

              resolve();
            } catch (error) {
              reject(error);
            }
          });

          zipfile.on('error', reject);
        });
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown ZIP processing error';
      result.errors.push(message);
      appLogger.error('ZIP scanning failed:', error);
    }

    return result;
  }
}
