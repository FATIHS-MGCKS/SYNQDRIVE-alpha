import { DimoAgentUseCase } from './dimo-agent-use-case.types';

/** Non-secret logging context for DIMO agent stream/message calls. */
export interface DimoAgentStreamCallContext {
  useCase: DimoAgentUseCase;
  orgId?: string;
  /**
   * When true, the call fails fast if no vehicleIds are provided.
   * Use only for flows that must not pretend to have live DIMO vehicle data.
   */
  requireVehicleScope?: boolean;
}

export interface DimoAgentVehicleScopeResolution {
  vehicleIds?: number[];
  hasVehicleScope: boolean;
  knowledgeOnlyFallback: boolean;
}

/** Normalize optional token IDs for DIMO Agents API `vehicleIds` body field. */
export function normalizeAgentVehicleIds(tokenIds?: number[]): number[] | undefined {
  if (!tokenIds?.length) return undefined;
  const unique = [...new Set(tokenIds.filter((id) => Number.isFinite(id) && id > 0))];
  return unique.length > 0 ? unique.sort((a, b) => a - b) : undefined;
}

/** Fleet chat: scope only when the user message resolves to one fleet vehicle with a tokenId. */
export function resolveChatVehicleTokenIds(resolvedTokenId: number | null | undefined): number[] | undefined {
  if (typeof resolvedTokenId === 'number' && resolvedTokenId > 0) {
    return [resolvedTokenId];
  }
  return undefined;
}

/**
 * Vehicle specs: DIMO-scoped when tokenId present; otherwise knowledge-only MMY fallback.
 * Never invents a tokenId.
 */
export function resolveVehicleSpecsScope(tokenIds?: number[]): DimoAgentVehicleScopeResolution {
  const vehicleIds = normalizeAgentVehicleIds(tokenIds);
  if (vehicleIds) {
    return { vehicleIds, hasVehicleScope: true, knowledgeOnlyFallback: false };
  }
  return { vehicleIds: undefined, hasVehicleScope: false, knowledgeOnlyFallback: true };
}

export function formatAgentScopeLog(ctx: DimoAgentStreamCallContext, vehicleIds?: number[]): string {
  const parts = [
    `useCase=${ctx.useCase}`,
    `hasVehicleScope=${Boolean(vehicleIds?.length)}`,
    `vehicleIdsCount=${vehicleIds?.length ?? 0}`,
  ];
  if (ctx.orgId) parts.push(`orgId=${ctx.orgId}`);
  return parts.join(' ');
}

export function assertVehicleScopeIfRequired(
  ctx: DimoAgentStreamCallContext | undefined,
  vehicleIds: number[] | undefined,
): string | undefined {
  if (ctx?.requireVehicleScope && !vehicleIds?.length) {
    return 'No DIMO tokenId available for this vehicle-scoped agent request';
  }
  return undefined;
}
