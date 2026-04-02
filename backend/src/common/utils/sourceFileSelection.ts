import { basename, extname } from 'node:path';
import type { SourceFile } from './zipProcessor.js';

export const MAX_ANALYSIS_SOURCE_FILES = 11;

type SourceFileLike = Pick<SourceFile, 'path' | 'content'>;

const HIGH_PRIORITY_FILENAMES = new Set([
  'main.tf',
  'variables.tf',
  'outputs.tf',
  'provider.tf',
  'versions.tf',
  'backend.tf',
  'locals.tf',
  'terraform.tfvars',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'package.json',
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'cargo.toml',
  'composer.json'
]);

const INFRA_PATH_HINTS = ['terraform', 'infrastructure', 'infra', 'kubernetes', 'k8s', 'helm'];

function scoreSourceFile(filePath: string, content: string): number {
  const normalizedPath = filePath.toLowerCase();
  const filename = basename(normalizedPath);
  const extension = extname(normalizedPath);
  let score = 0;

  if (extension === '.tf' || extension === '.tfvars' || extension === '.hcl') {
    score += 120;
  }

  if (HIGH_PRIORITY_FILENAMES.has(filename)) {
    score += 60;
  }

  if (INFRA_PATH_HINTS.some((hint) => normalizedPath.includes(hint))) {
    score += 40;
  }

  if (normalizedPath.includes('.github/workflows')) {
    score += 35;
  }

  if (filename.startsWith('readme')) {
    score += 10;
  }

  if (/\b(test|spec)\b/i.test(normalizedPath)) {
    score += 15;
  }

  if (/(resource|module|provider|variable|output)\s+"?/i.test(content)) {
    score += 20;
  }

  if (/(apiVersion:|kind:|jobs:|steps:)/i.test(content)) {
    score += 10;
  }

  if (/(import|export|function|class|def|public|private|const|let|var)\b/.test(content)) {
    score += 5;
  }

  return score;
}

function selectByScore<T extends SourceFileLike>(sourceFiles: T[], limit: number): T[] {
  return [...sourceFiles]
    .sort((left, right) => {
      const scoreDifference = scoreSourceFile(right.path, right.content) - scoreSourceFile(left.path, left.content);
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return left.path.localeCompare(right.path);
    })
    .slice(0, limit);
}

export function selectRelevantSourceFiles<T extends SourceFileLike>(sourceFiles: T[], limit = MAX_ANALYSIS_SOURCE_FILES): T[] {
  return selectByScore(sourceFiles, limit);
}

export function selectRelevantSourceCodeEntries(
  sourceCodeContent: Record<string, string>,
  limit = MAX_ANALYSIS_SOURCE_FILES
): SourceFileLike[] {
  return selectByScore(
    Object.entries(sourceCodeContent).map(([path, content]) => ({ path, content })),
    limit
  );
}