import { ResultsService } from '../services/resultsService.js';

describe('ResultsService.getStatusMessage', () => {
  it('explains retryable failures', () => {
    const message = ResultsService.getStatusMessage({
      status: 'failed',
      recovery: {
        retryCount: 0,
        maxRetryCount: 2,
        failureCategory: 'transient',
      },
    });

    expect(message).toContain('retry');
  });

  it('explains terminal failures', () => {
    const message = ResultsService.getStatusMessage({
      status: 'failed',
      recovery: {
        retryCount: 2,
        maxRetryCount: 2,
        failureCategory: 'terminal',
        failureReason: 'Analysis currently requires a ZIP solution file',
      },
    });

    expect(message).toContain('terminal issue');
  });

  it('distinguishes active reanalysis runs', () => {
    const message = ResultsService.getStatusMessage({
      status: 'processing',
      recovery: {
        retryCount: 1,
        maxRetryCount: 2,
        activeRunType: 'reanalysis',
      },
    });

    expect(message).toContain('Re-analysis in progress');
  });
});
