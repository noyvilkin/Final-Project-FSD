import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

jest.setTimeout(180000);

describe('Assignment audit integration', () => {
  test('runs audit runner (dry-run) and produces a summary with expected metrics', () => {
    const cwd = path.resolve(__dirname, '../../../');
    const env = { ...process.env, ASSIGNMENT_AI_DRY_RUN: 'true' };

    // Run the full audit (runner + scoring). Uses MongoMemoryServer if no MONGODB_URI.
    execSync('npm run audit', { cwd, env, stdio: 'inherit', timeout: 180000 });

    const reportsDir = path.join(cwd, 'reports', 'assignment-audit');
    const runs = fs.existsSync(reportsDir)
      ? fs.readdirSync(reportsDir).filter((name) => fs.statSync(path.join(reportsDir, name)).isDirectory())
      : [];

    expect(runs.length).toBeGreaterThan(0);

    const latest = runs.sort().reverse()[0];
    const summaryPath = path.join(reportsDir, latest, 'summary.json');
    expect(fs.existsSync(summaryPath)).toBe(true);

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

    // Expect the harness to detect faulty packages and produce balanced feedback in dry-run
    // With 5 faulty + 1 good fixture, expect high detection but not perfect accuracy
    expect(summary.totals.packages).toBeGreaterThanOrEqual(5);
    expect(summary.totals.detected).toBeGreaterThanOrEqual(5);
    expect(summary.metrics.detectionRate).toBe(1);
    expect(summary.metrics.feedbackAccuracy).toBeGreaterThanOrEqual(0.8);
    expect(summary.metrics.noiseReductionRate).toBe(1);
  });
});
