import { selectRelevantSourceCodeEntries, selectRelevantSourceFiles } from '../utils/sourceFileSelection.js';
import { ProjectAnalyzer } from '../utils/projectAnalyzer.js';

describe('source file selection', () => {
  it('prioritizes terraform files and caps the analysis set', () => {
    const sourceCodeContent = {
      'docs/README.md': '# docs',
      'infra/main.tf': 'resource "aws_s3_bucket" "site" {}',
      'infra/provider.tf': 'provider "aws" {}',
      'infra/variables.tf': 'variable "region" {}',
      'infra/outputs.tf': 'output "bucket" {}',
      'infra/backend.tf': 'terraform { backend "s3" {} }',
      'infra/locals.tf': 'locals {}',
      'infra/versions.tf': 'terraform { required_version = ">= 1.0" }',
      'infra/modules/network/main.tf': 'resource "aws_vpc" "main" {}',
      'infra/modules/network/variables.tf': 'variable "cidr_block" {}',
      'infra/modules/network/outputs.tf': 'output "vpc_id" {}',
      'github/workflows/ci.yml': 'name: CI\njobs:\n  build:\n    steps: []',
      'misc/notes.txt': 'ignore me'
    };

    const selectedEntries = selectRelevantSourceCodeEntries(sourceCodeContent, 11);
    const selectedFiles = selectRelevantSourceFiles(
      Object.entries(sourceCodeContent).map(([path, content]) => ({ path, content })),
      11
    );

    expect(selectedEntries).toHaveLength(11);
    expect(selectedFiles).toHaveLength(11);
    expect(selectedEntries.map((file) => file.path)).toEqual(selectedFiles.map((file) => file.path));
    expect(selectedEntries.map((file) => file.path)).toContain('infra/main.tf');
    expect(selectedEntries.map((file) => file.path)).toContain('infra/provider.tf');
    expect(selectedEntries.map((file) => file.path)).not.toContain('misc/notes.txt');
  });

  it('recognizes terraform as the primary language for terraform-heavy archives', () => {
    const analysis = ProjectAnalyzer.analyzeProject({
      isValid: true,
      totalFiles: 3,
      sourceFiles: [
        { path: 'infra/main.tf', content: 'resource "aws_s3_bucket" "site" {}', language: 'terraform', size: 100 },
        { path: 'infra/variables.tf', content: 'variable "region" {}', language: 'terraform', size: 80 },
        { path: 'infra/outputs.tf', content: 'output "bucket" {}', language: 'terraform', size: 60 },
      ],
      detectedLanguage: null,
      projectScope: 'small',
      totalSourceSize: 240,
      errors: [],
      metadata: {
        hasPackageJson: false,
        hasReadme: false,
        hasGitRepo: false,
        mainLanguageConfidence: 0,
        frameworks: []
      }
    });

    expect(analysis.primaryLanguage).toBe('terraform');
    expect(analysis.languageConfidence).toBeGreaterThan(0);
  });
});