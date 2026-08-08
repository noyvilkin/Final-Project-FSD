export type LLMModule = 'interview' | 'assignment' | 'resume' | 'profileAnalysis';

const MODULE_ENV_VARS: Record<LLMModule, string> = {
  interview:       'COLMAN_LLM_MODEL_INTERVIEW',
  assignment:      'COLMAN_LLM_MODEL_ASSIGNMENT',
  resume:          'COLMAN_LLM_MODEL_RESUME',
  profileAnalysis: 'COLMAN_LLM_MODEL_PROFILE_ANALYSIS',
};

/**
 * Resolves which Colman model a feature module should use: its own
 * COLMAN_LLM_MODEL_<MODULE> override if set, otherwise the shared
 * COLMAN_LLM_MODEL default. Returns undefined if neither is set, letting
 * ColmanLLMClient fall back to its own hardcoded default.
 */
export function resolveModelForModule(module: LLMModule): string | undefined {
  const override = process.env[MODULE_ENV_VARS[module]];
  if (override && override.trim()) return override.trim();

  const shared = process.env.COLMAN_LLM_MODEL;
  return shared && shared.trim() ? shared.trim() : undefined;
}
