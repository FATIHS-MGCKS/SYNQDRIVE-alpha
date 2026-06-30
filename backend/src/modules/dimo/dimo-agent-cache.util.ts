import { createHash } from 'crypto';
import { DimoAgentPersonality } from './dimo-agent-personality.util';
import { DimoAgentUseCase, GetOrCreateAgentInput } from './dimo-agent-use-case.types';

/** Redis TTL for scoped agent IDs (30 days — matches previous global TTL). */
export const DIMO_AGENT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface DimoAgentCacheKeyInput {
  useCase: DimoAgentUseCase;
  orgId?: string;
  walletHash: string;
  personality: string;
  vehicleScopeHash: string;
}

/** One-way hash of a wallet address — never store the raw wallet in Redis keys. */
export function hashDimoAgentWallet(wallet: string): string {
  const normalized = wallet.trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/** Stable hash for sorted vehicle token IDs; `none` when absent. */
export function hashDimoAgentVehicleIds(vehicleIds?: number[]): string {
  if (!vehicleIds?.length) return 'none';
  const normalized = [...vehicleIds].sort((a, b) => a - b).join(',');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Build a scoped Redis/memory cache key for a DIMO agent instance.
 * Example (no secrets):
 *   dimo:agents:vehicle_specs:global:a1b2c3d4e5f6g7h8:master_technician:9f86d081884c7d65
 */
export function buildDimoAgentCacheKey(input: DimoAgentCacheKeyInput): string {
  const orgScope = input.orgId?.trim() || 'global';
  const personality = input.personality.trim() || 'default';
  return `dimo:agents:${input.useCase}:${orgScope}:${input.walletHash}:${personality}:${input.vehicleScopeHash}`;
}

export function resolveDimoAgentCacheKey(
  input: GetOrCreateAgentInput,
  defaultWallet: string,
  resolvedPersonality: DimoAgentPersonality,
): { cacheKey: string; personality: DimoAgentPersonality; wallet: string } {
  const wallet = (input.userWallet ?? defaultWallet).trim();
  const cacheKey = buildDimoAgentCacheKey({
    useCase: input.useCase,
    orgId: input.orgId,
    walletHash: hashDimoAgentWallet(wallet),
    personality: resolvedPersonality,
    vehicleScopeHash: hashDimoAgentVehicleIds(input.vehicleIds),
  });
  return { cacheKey, personality: resolvedPersonality, wallet };
}
