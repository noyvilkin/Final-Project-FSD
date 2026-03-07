import { extname, basename } from 'node:path';
import type { SourceFile, ZipScanResult } from './zipProcessor.js';
import { appLogger } from '../services/logger.js';

export interface ProjectComplexityMetrics {
  linesOfCode: number;
  fileCount: number;
  directoryDepth: number;
  averageFileSize: number;
  cyclomaticComplexity: number; // estimated
  testCoverage: number; // estimated based on test files
}

export interface DetectedFramework {
  name: string;
  confidence: number;
  version?: string;
  evidence: string[];
}

export interface LanguageStats {
  language: string;
  fileCount: number;
  totalSize: number;
  percentage: number;
  extensions: string[];
}

export interface ProjectAnalysisResult {
  primaryLanguage: string | null;
  languageConfidence: number;
  allLanguages: LanguageStats[];
  frameworks: DetectedFramework[];
  projectScope: 'small' | 'medium' | 'large';
  complexity: ProjectComplexityMetrics;
  projectType: 'web-frontend' | 'web-backend' | 'mobile' | 'desktop' | 'library' | 'data-science' | 'game' | 'other';
  buildSystem: string | null;
  hasTests: boolean;
  hasDocumentation: boolean;
  qualityScore: number; // 0-100
  recommendations: string[];
}

export class ProjectAnalyzer {
  private static readonly LANGUAGE_EXTENSIONS: Record<string, string[]> = {
    javascript: ['.js', '.jsx', '.mjs', '.cjs'],
    typescript: ['.ts', '.tsx'],
    python: ['.py', '.pyi', '.pyx', '.ipynb'],
    java: ['.java'],
    csharp: ['.cs', '.vb'],
    cpp: ['.cpp', '.cc', '.cxx', '.c++', '.c', '.h', '.hpp', '.hh'],
    go: ['.go'],
    rust: ['.rs'],
    php: ['.php', '.phtml'],
    ruby: ['.rb', '.rake'],
    swift: ['.swift'],
    kotlin: ['.kt', '.kts'],
    scala: ['.scala'],
    dart: ['.dart'],
    html: ['.html', '.htm'],
    css: ['.css', '.scss', '.sass', '.less', '.stylus'],
    sql: ['.sql'],
    shell: ['.sh', '.bash', '.zsh', '.fish'],
    powershell: ['.ps1', '.psm1'],
    yaml: ['.yml', '.yaml'],
    json: ['.json'],
    xml: ['.xml', '.xsl', '.xslt'],
    dockerfile: ['dockerfile'],
    makefile: ['makefile'],
    r: ['.r', '.R'],
    matlab: ['.m'],
    perl: ['.pl', '.pm'],
    lua: ['.lua']
  };

  private static readonly FRAMEWORK_PATTERNS: Record<string, {
    files: string[];
    content: RegExp[];
    dependencies: string[];
    confidence: number;
  }> = {
    'React': {
      files: ['package.json'],
      content: [/import.*react/i, /from ['"]react['"]/i, /jsx/i],
      dependencies: ['react', '@types/react'],
      confidence: 0.9
    },
    'Vue': {
      files: ['package.json'],
      content: [/import.*vue/i, /from ['"]vue['"]/i, /<template>/i],
      dependencies: ['vue', '@vue/cli'],
      confidence: 0.9
    },
    'Angular': {
      files: ['angular.json', 'package.json'],
      content: [/@angular/i, /@component/i, /@injectable/i],
      dependencies: ['@angular/core'],
      confidence: 0.95
    },
    'Next.js': {
      files: ['next.config.js', 'package.json'],
      content: [/next\/head/i, /next\/image/i, /next\/router/i],
      dependencies: ['next'],
      confidence: 0.95
    },
    'Express': {
      files: ['package.json'],
      content: [/express\(\)/i, /app\.listen/i, /app\.use/i],
      dependencies: ['express'],
      confidence: 0.8
    },
    'Django': {
      files: ['manage.py', 'settings.py', 'requirements.txt'],
      content: [/from django/i, /django\.conf/i],
      dependencies: ['Django'],
      confidence: 0.95
    },
    'Flask': {
      files: ['app.py', 'requirements.txt'],
      content: [/from flask/i, /Flask\(__name__\)/i],
      dependencies: ['Flask'],
      confidence: 0.9
    },
    'Spring Boot': {
      files: ['pom.xml', 'build.gradle'],
      content: [/@SpringBootApplication/i, /@RestController/i],
      dependencies: ['spring-boot-starter'],
      confidence: 0.95
    },
    'Laravel': {
      files: ['composer.json', 'artisan'],
      content: [/illuminate\\/i, /laravel/i],
      dependencies: ['laravel/framework'],
      confidence: 0.9
    },
    'Unity': {
      files: ['ProjectSettings.asset'],
      content: [/UnityEngine/i, /MonoBehaviour/i],
      dependencies: [],
      confidence: 0.95
    }
  };

  /**
   * Analyze a project from ZIP scan results
   */
  static analyzeProject(zipScanResult: ZipScanResult): ProjectAnalysisResult {
    const sourceFiles = zipScanResult.sourceFiles;
    
    // Language analysis
    const languageStats = this.analyzeLanguages(sourceFiles);
    const primaryLanguage = languageStats.length > 0 ? languageStats[0] : null;
    
    // Framework detection
    const frameworks = this.detectFrameworks(sourceFiles, zipScanResult.metadata.frameworks);
    
    // Project type classification
    const projectType = this.classifyProjectType(languageStats, frameworks, sourceFiles);
    
    // Complexity analysis
    const complexity = this.analyzeComplexity(sourceFiles);
    
    // Build system detection
    const buildSystem = this.detectBuildSystem(sourceFiles);
    
    // Quality assessment
    const hasTests = this.hasTestFiles(sourceFiles);
    const hasDocumentation = this.hasDocumentationFiles(sourceFiles);
    const qualityScore = this.calculateQualityScore(hasTests, hasDocumentation, complexity);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(
      languageStats, frameworks, hasTests, hasDocumentation, complexity
    );

    const result: ProjectAnalysisResult = {
      primaryLanguage: primaryLanguage?.language || null,
      languageConfidence: primaryLanguage?.percentage || 0,
      allLanguages: languageStats,
      frameworks,
      projectScope: this.determineProjectScope(complexity, sourceFiles.length),
      complexity,
      projectType,
      buildSystem,
      hasTests,
      hasDocumentation,
      qualityScore,
      recommendations
    };

    appLogger.info('Project analysis completed', {
      primaryLanguage: result.primaryLanguage,
      projectType: result.projectType,
      frameworks: result.frameworks.map(f => f.name),
      qualityScore: result.qualityScore
    });

    return result;
  }

  /**
   * Analyze programming languages used in the project
   */
  private static analyzeLanguages(sourceFiles: SourceFile[]): LanguageStats[] {
    const languageMap = new Map<string, { fileCount: number; totalSize: number; extensions: Set<string> }>();
    let totalProjectSize = 0;

    sourceFiles.forEach(file => {
      const language = this.detectLanguageFromPath(file.path);
      const ext = extname(file.path);
      
      if (!languageMap.has(language)) {
        languageMap.set(language, { fileCount: 0, totalSize: 0, extensions: new Set() });
      }
      
      const stats = languageMap.get(language)!;
      stats.fileCount++;
      stats.totalSize += file.size;
      stats.extensions.add(ext);
      totalProjectSize += file.size;
    });

    const languageStats: LanguageStats[] = Array.from(languageMap.entries())
      .map(([language, stats]) => ({
        language,
        fileCount: stats.fileCount,
        totalSize: stats.totalSize,
        percentage: totalProjectSize > 0 ? (stats.totalSize / totalProjectSize) * 100 : 0,
        extensions: Array.from(stats.extensions)
      }))
      .sort((a, b) => b.totalSize - a.totalSize); // Sort by size

    return languageStats;
  }

  /**
   * Detect programming language from file path
   */
  private static detectLanguageFromPath(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    const filename = basename(filePath).toLowerCase();

    // Special files
    if (['dockerfile', 'makefile', 'rakefile'].includes(filename)) {
      return filename;
    }

    // Extension mapping
    for (const [language, extensions] of Object.entries(this.LANGUAGE_EXTENSIONS)) {
      if (extensions.includes(ext)) {
        return language;
      }
    }

    return 'other';
  }

  /**
   * Detect frameworks used in the project
   */
  private static detectFrameworks(sourceFiles: SourceFile[], knownFrameworks: string[]): DetectedFramework[] {
    const detectedFrameworks: DetectedFramework[] = [];
    const fileMap = new Map(sourceFiles.map(f => [f.path.toLowerCase(), f]));
    const allContent = sourceFiles.map(f => f.content).join('\n').toLowerCase();

    for (const [frameworkName, pattern] of Object.entries(this.FRAMEWORK_PATTERNS)) {
      let confidence = 0;
      const evidence: string[] = [];

      // Check for required files
      const requiredFiles = pattern.files.filter(fileName => 
        fileMap.has(fileName) || 
        sourceFiles.some(f => basename(f.path).toLowerCase() === fileName)
      );
      
      if (requiredFiles.length > 0) {
        confidence += 0.4;
        evidence.push(`Found files: ${requiredFiles.join(', ')}`);
      }

      // Check content patterns
      const matchingPatterns = pattern.content.filter(regex => regex.test(allContent));
      if (matchingPatterns.length > 0) {
        confidence += 0.3 * matchingPatterns.length;
        evidence.push(`Found code patterns: ${matchingPatterns.length} matches`);
      }

      // Check dependencies in package.json or similar
      const packageFile = sourceFiles.find(f => basename(f.path) === 'package.json');
      if (packageFile && pattern.dependencies.length > 0) {
        try {
          const packageJson = JSON.parse(packageFile.content);
          const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
          const foundDeps = pattern.dependencies.filter(dep => allDeps[dep]);
          
          if (foundDeps.length > 0) {
            confidence += 0.5;
            evidence.push(`Dependencies: ${foundDeps.join(', ')}`);
          }
        } catch {
          // Ignore JSON parse errors
        }
      }

      // Check against known frameworks from ZIP processor
      if (knownFrameworks.includes(frameworkName.toLowerCase())) {
        confidence += 0.2;
        evidence.push('Detected in file structure analysis');
      }

      if (confidence > 0.3) {
        detectedFrameworks.push({
          name: frameworkName,
          confidence: Math.min(confidence, 1.0),
          evidence
        });
      }
    }

    return detectedFrameworks.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Classify the type of project
   */
  private static classifyProjectType(
    languageStats: LanguageStats[], 
    frameworks: DetectedFramework[], 
    sourceFiles: SourceFile[]
  ): ProjectAnalysisResult['projectType'] {
    const frameworkNames = frameworks.map(f => f.name.toLowerCase());
    const languages = languageStats.map(l => l.language);

    // Web frontend
    if (frameworkNames.some(f => ['react', 'vue', 'angular'].includes(f)) ||
        languages.includes('javascript') && languages.includes('css')) {
      return 'web-frontend';
    }

    // Web backend
    if (frameworkNames.some(f => ['express', 'django', 'flask', 'spring boot', 'laravel'].includes(f)) ||
        languages.some(l => ['php', 'python', 'java'].includes(l))) {
      return 'web-backend';
    }

    // Mobile
    if (languages.includes('swift') || languages.includes('kotlin') || 
        frameworkNames.includes('react native') || frameworkNames.includes('flutter')) {
      return 'mobile';
    }

    // Desktop
    if (languages.some(l => ['cpp', 'csharp', 'java'].includes(l)) &&
        !frameworkNames.some(f => ['spring boot'].includes(f))) {
      return 'desktop';
    }

    // Data Science
    if (languages.includes('python') && 
        (sourceFiles.some(f => f.path.includes('notebook') || f.path.includes('.ipynb')) ||
         sourceFiles.some(f => f.content.includes('pandas') || f.content.includes('numpy')))) {
      return 'data-science';
    }

    // Game
    if (frameworkNames.includes('unity') || 
        sourceFiles.some(f => f.content.includes('UnityEngine') || f.content.includes('MonoBehaviour'))) {
      return 'game';
    }

    // Library
    if (sourceFiles.some(f => basename(f.path) === 'setup.py' || basename(f.path) === 'package.json') &&
        !frameworkNames.length) {
      return 'library';
    }

    return 'other';
  }

  /**
   * Analyze project complexity
   */
  private static analyzeComplexity(sourceFiles: SourceFile[]): ProjectComplexityMetrics {
    let totalLines = 0;
    let totalSize = 0;
    const depths = new Set<number>();

    sourceFiles.forEach(file => {
      // Estimate lines of code (rough approximation)
      const lines = file.content.split('\n').length;
      totalLines += lines;
      totalSize += file.size;

      // Calculate directory depth
      const depth = file.path.split('/').length - 1;
      depths.add(depth);
    });

    const averageFileSize = sourceFiles.length > 0 ? totalSize / sourceFiles.length : 0;
    const maxDepth = depths.size > 0 ? Math.max(...depths) : 0;

    // Estimate cyclomatic complexity based on control flow keywords
    const controlFlowRegex = /\b(if|else|for|while|switch|case|catch|try)\b/gi;
    const totalControlFlow = sourceFiles.reduce((acc, file) => {
      const matches = file.content.match(controlFlowRegex);
      return acc + (matches ? matches.length : 0);
    }, 0);

    // Estimate test coverage based on test files
    const testFiles = sourceFiles.filter(f => 
      f.path.includes('test') || 
      f.path.includes('spec') || 
      f.path.includes('__test__') ||
      f.content.includes('describe(') ||
      f.content.includes('it(') ||
      f.content.includes('test(')
    );
    
    const testCoverage = sourceFiles.length > 0 ? (testFiles.length / sourceFiles.length) * 100 : 0;

    return {
      linesOfCode: totalLines,
      fileCount: sourceFiles.length,
      directoryDepth: maxDepth,
      averageFileSize,
      cyclomaticComplexity: totalControlFlow,
      testCoverage
    };
  }

  /**
   * Determine project scope based on complexity metrics
   */
  private static determineProjectScope(complexity: ProjectComplexityMetrics, fileCount: number): 'small' | 'medium' | 'large' {
    if (fileCount <= 10 && complexity.linesOfCode <= 500) {
      return 'small';
    } else if (fileCount <= 50 && complexity.linesOfCode <= 2000) {
      return 'medium';
    } else {
      return 'large';
    }
  }

  /**
   * Detect build system
   */
  private static detectBuildSystem(sourceFiles: SourceFile[]): string | null {
    const buildFiles = [
      { name: 'package.json', system: 'npm' },
      { name: 'yarn.lock', system: 'yarn' },
      { name: 'pom.xml', system: 'maven' },
      { name: 'build.gradle', system: 'gradle' },
      { name: 'Cargo.toml', system: 'cargo' },
      { name: 'go.mod', system: 'go modules' },
      { name: 'requirements.txt', system: 'pip' },
      { name: 'Pipfile', system: 'pipenv' },
      { name: 'pyproject.toml', system: 'poetry' },
      { name: 'Makefile', system: 'make' },
      { name: 'CMakeLists.txt', system: 'cmake' }
    ];

    for (const buildFile of buildFiles) {
      if (sourceFiles.some(f => basename(f.path).toLowerCase() === buildFile.name.toLowerCase())) {
        return buildFile.system;
      }
    }

    return null;
  }

  /**
   * Check if project has test files
   */
  private static hasTestFiles(sourceFiles: SourceFile[]): boolean {
    return sourceFiles.some(f => 
      f.path.toLowerCase().includes('test') || 
      f.path.toLowerCase().includes('spec') ||
      f.path.toLowerCase().includes('__test__') ||
      f.content.includes('describe(') ||
      f.content.includes('it(') ||
      f.content.includes('test(') ||
      f.content.includes('@Test')
    );
  }

  /**
   * Check if project has documentation
   */
  private static hasDocumentationFiles(sourceFiles: SourceFile[]): boolean {
    return sourceFiles.some(f => {
      const filename = basename(f.path).toLowerCase();
      return filename.startsWith('readme') || 
             filename.includes('doc') || 
             filename.includes('guide') ||
             f.path.toLowerCase().includes('/docs/') ||
             f.path.toLowerCase().includes('/documentation/');
    });
  }

  /**
   * Calculate overall project quality score (0-100)
   */
  private static calculateQualityScore(
    hasTests: boolean, 
    hasDocumentation: boolean, 
    complexity: ProjectComplexityMetrics
  ): number {
    let score = 50; // Base score

    // Test coverage bonus
    if (hasTests) {
      score += 20;
      score += Math.min(20, complexity.testCoverage / 5); // Up to 20 more for good coverage
    }

    // Documentation bonus
    if (hasDocumentation) {
      score += 15;
    }

    // Code organization bonus/penalty
    if (complexity.directoryDepth > 1) {
      score += 10; // Good structure
    }
    if (complexity.averageFileSize > 10000) {
      score -= 10; // Files too large
    }
    if (complexity.averageFileSize < 100) {
      score -= 5; // Files too small (might indicate poor organization)
    }

    // Complexity penalty
    if (complexity.cyclomaticComplexity / complexity.fileCount > 20) {
      score -= 15; // High complexity per file
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate recommendations for project improvement
   */
  private static generateRecommendations(
    languageStats: LanguageStats[], 
    frameworks: DetectedFramework[], 
    hasTests: boolean, 
    hasDocumentation: boolean, 
    complexity: ProjectComplexityMetrics
  ): string[] {
    const recommendations: string[] = [];

    if (!hasTests) {
      recommendations.push('Add unit tests to improve code reliability and maintainability');
    } else if (complexity.testCoverage < 50) {
      recommendations.push('Increase test coverage for better code quality assurance');
    }

    if (!hasDocumentation) {
      recommendations.push('Add a README file and code documentation to improve project understanding');
    }

    if (complexity.averageFileSize > 10000) {
      recommendations.push('Consider breaking down large files into smaller, more focused modules');
    }

    if (complexity.cyclomaticComplexity / complexity.fileCount > 20) {
      recommendations.push('Refactor complex functions to improve code readability and maintainability');
    }

    if (languageStats.length > 3) {
      recommendations.push('Consider consolidating the technology stack to reduce complexity');
    }

    if (frameworks.length === 0 && complexity.fileCount > 5) {
      recommendations.push('Consider adopting a framework to improve development efficiency');
    }

    if (complexity.directoryDepth <= 1 && complexity.fileCount > 10) {
      recommendations.push('Organize code into logical directories for better project structure');
    }

    return recommendations;
  }
}
