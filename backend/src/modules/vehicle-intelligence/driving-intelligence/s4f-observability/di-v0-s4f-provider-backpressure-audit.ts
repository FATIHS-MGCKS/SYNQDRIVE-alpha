/**
 * S4F provider backpressure audit (static + certification markers).
 * Contract: s4a-contract.v2.json `providerBackpressure` + gap DI-GAP-S4-PROVIDER-BACKPRESSURE-001.
 */

import { DI_V0_S4F2_PROVIDER_BACKPRESSURE_CERTIFICATION } from './di-v0-s4f-provider-backpressure-certification';

export type DiV0S4fProviderBackpressureGapStatus = 'OPEN_CONFIRMED' | 'CLOSURE_CANDIDATE' | 'CLOSED';

export interface DiV0S4fProviderBackpressureAudit {
  gapId: 'DI-GAP-S4-PROVIDER-BACKPRESSURE-001';
  gapStatus: DiV0S4fProviderBackpressureGapStatus;
  endToEndBudgetPathProven: boolean;
  s4BackgroundPriorityProven: boolean;
  s4BudgetBypassPossible: boolean;
  multiReplicaBackpressureProven: boolean;
  authorityChangeRequiredForClosure: boolean;
  notes: readonly string[];
}

export function auditDiV0S4ProviderBackpressure(): DiV0S4fProviderBackpressureAudit {
  const status = DI_V0_S4F2_PROVIDER_BACKPRESSURE_CERTIFICATION.gapStatus;
  const candidate = status === 'CLOSURE_CANDIDATE';
  const closed = status === 'CLOSED';
  const notes: string[] = [
    'S4C acquisition uses frozen DI_V0_S4C_DIMO_REQUEST_CONTEXT (POST_TRIP_ENRICHMENT / BACKGROUND) — parent bypass cannot inherit.',
    'Shared request executor owns HTTP retries; S4 state machine owns cross-attempt retry (T07).',
    'Multi-replica Redis integration proves global in-flight cap, reserved HIGH slots under normal admission, lease recovery, shared 429 cooldown, Redis fail-closed.',
    'Global provider cooldown blocks all priorities before cap logic (P1.3 acquire step 2) — reserved slots do not protect HIGH/CRITICAL during cooldown.',
    'Tiny activation still requires providerGlobalBudgetEnabled=ENABLED, operator authorization, and remaining contract gates even when this gap is CLOSED.',
    'Production N≈1000 load certification is not claimed — atomic Redis invariants only.',
  ];

  return {
    gapId: 'DI-GAP-S4-PROVIDER-BACKPRESSURE-001',
    gapStatus: closed ? 'CLOSED' : candidate ? 'CLOSURE_CANDIDATE' : 'OPEN_CONFIRMED',
    endToEndBudgetPathProven: true,
    s4BackgroundPriorityProven: true,
    s4BudgetBypassPossible: !(candidate || closed),
    multiReplicaBackpressureProven: DI_V0_S4F2_PROVIDER_BACKPRESSURE_CERTIFICATION.multiReplicaRedisIntegrationProven,
    authorityChangeRequiredForClosure: !closed,
    notes,
  };
}
