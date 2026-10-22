import type { HvChargeSessionBoundaryEnrichmentService } from './hv-charge-session-boundary-enrichment.service';

/** Pass-through enrichment for integration tests that do not seed HV snapshots. */
export function createPassThroughHvChargeSessionBoundaryEnrichment(): HvChargeSessionBoundaryEnrichmentService {
  return {
    enrichDraftFromSnapshots: async ({ draft }) => draft,
  } as HvChargeSessionBoundaryEnrichmentService;
}
