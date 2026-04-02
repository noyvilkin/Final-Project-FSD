import { canRetryAssignment, normalizeAnalysisFailure, MAX_ASSIGNMENT_RETRIES } from '../services/assignmentRecovery.js';

describe('assignmentRecovery', () => {
  it('classifies transient infrastructure failures', () => {
    const normalized = normalizeAnalysisFailure(new Error('Request timed out while contacting Gemini'));

    expect(normalized.category).toBe('transient');
    expect(normalized.reason).toContain('Request timed out');
  });

  it('classifies terminal validation failures', () => {
    const normalized = normalizeAnalysisFailure('Analysis currently requires a ZIP solution file');

    expect(normalized.category).toBe('terminal');
    expect(normalized.reason).toContain('ZIP solution file');
  });

  it('enforces bounded retries', () => {
    expect(canRetryAssignment(MAX_ASSIGNMENT_RETRIES - 1)).toBe(true);
    expect(canRetryAssignment(MAX_ASSIGNMENT_RETRIES)).toBe(false);
  });
});
