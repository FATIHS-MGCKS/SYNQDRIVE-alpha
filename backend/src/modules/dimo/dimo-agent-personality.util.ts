import { DimoAgentUseCase } from './dimo-agent-use-case.types';

/** Personalities supported by the DIMO Agents API (`driver_agent_v1`). */
export const DIMO_AGENT_ALLOWED_PERSONALITIES = [
  'uncle_mechanic',
  'master_technician',
  'concierge',
  'driving_enthusiast',
  'fleet_manager_pro',
] as const;

export type DimoAgentPersonality = (typeof DIMO_AGENT_ALLOWED_PERSONALITIES)[number];

export const DIMO_AGENT_USE_CASE_DEFAULT_PERSONALITY: Record<DimoAgentUseCase, DimoAgentPersonality> = {
  vehicle_specs: 'master_technician',
  tire_specs: 'master_technician',
  document_extraction: 'fleet_manager_pro',
  fleet_chat: 'fleet_manager_pro',
};

const ALLOWED_SET = new Set<string>(DIMO_AGENT_ALLOWED_PERSONALITIES);

export function isDimoAgentPersonality(value: string): value is DimoAgentPersonality {
  return ALLOWED_SET.has(value);
}

/**
 * Resolve a DIMO agent personality from env/override with validation.
 * Invalid values log a warning (via `warn`) and fall back to the use-case default.
 */
export function sanitizeDimoAgentPersonality(
  raw: string | undefined,
  useCase: DimoAgentUseCase,
  warn?: (message: string) => void,
): DimoAgentPersonality {
  const fallback = DIMO_AGENT_USE_CASE_DEFAULT_PERSONALITY[useCase];
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return fallback;
  if (isDimoAgentPersonality(trimmed)) return trimmed;
  warn?.(
    `[Agents] Invalid personality "${trimmed}" for useCase=${useCase} — falling back to ${fallback}`,
  );
  return fallback;
}

export interface DimoAgentPersonalityEnvOverrides {
  vehicleSpecs?: string;
  tireSpecs?: string;
  document?: string;
  chat?: string;
}

export function resolveDimoAgentPersonalityFromEnv(
  useCase: DimoAgentUseCase,
  env: DimoAgentPersonalityEnvOverrides,
  explicitOverride?: string,
  warn?: (message: string) => void,
): DimoAgentPersonality {
  if (explicitOverride?.trim()) {
    return sanitizeDimoAgentPersonality(explicitOverride, useCase, warn);
  }

  const envRaw =
    useCase === 'vehicle_specs'
      ? env.vehicleSpecs
      : useCase === 'tire_specs'
        ? env.tireSpecs
        : useCase === 'document_extraction'
          ? env.document
          : env.chat;

  return sanitizeDimoAgentPersonality(envRaw, useCase, warn);
}
