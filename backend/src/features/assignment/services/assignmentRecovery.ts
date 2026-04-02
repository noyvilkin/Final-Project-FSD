export type RecoveryFailureCategory = 'transient' | 'terminal' | 'unknown';

export type RecoveryRunType = 'initial' | 'retry' | 'reanalysis';

export const MAX_ASSIGNMENT_RETRIES = 2;

export interface NormalizedFailureReason {
  reason: string;
  category: RecoveryFailureCategory;
  details: string[];
}

const TRANSIENT_FAILURE_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /rate limit/i,
  /429/i,
  /ec?onnreset/i,
  /ec?onntimeout/i,
  /network/i,
  /temporary/i,
  /unavailable/i,
  /retry/i,
  /socket hang up/i,
  /fetch failed/i,
];

const TERMINAL_FAILURE_PATTERNS = [
  /invalid zip/i,
  /unsupported/i,
  /missing .*file/i,
  /not found/i,
  /permission denied/i,
  /parse failed/i,
  /malformed/i,
  /analysis currently requires/i,
];

const normalizeTextLines = (value: string): string[] =>
  value
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

export const normalizeAnalysisFailure = (
  error: unknown,
  fallbackReason: string = 'Analysis failed'
): NormalizedFailureReason => {
  const rawMessage =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : fallbackReason;

  const details = normalizeTextLines(rawMessage);
  const reason = details[0] || fallbackReason;
  const haystack = `${rawMessage}\n${details.join('\n')}`;

  if (TRANSIENT_FAILURE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return {
      reason,
      category: 'transient',
      details,
    };
  }

  if (TERMINAL_FAILURE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return {
      reason,
      category: 'terminal',
      details,
    };
  }

  return {
    reason,
    category: 'unknown',
    details,
  };
};

export const canRetryAssignment = (retryCount: number, maxRetries: number = MAX_ASSIGNMENT_RETRIES): boolean => {
  return retryCount < maxRetries;
};
