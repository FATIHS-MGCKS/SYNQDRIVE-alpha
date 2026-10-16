import type {
  VsiApdsP5ObservabilitySnapshotV1,
  VsiApdsReadonlyCapabilityObservationV1,
} from './vsi-apds-p5.types';
import { VsiApdsDemandClassification } from './vsi-apds-p5.types';

export function summarizeVsiApdsP5Observability(
  observations: readonly VsiApdsReadonlyCapabilityObservationV1[],
  correlationErrors: number = 0,
): VsiApdsP5ObservabilitySnapshotV1 {
  let profilesPresent = 0;
  let profilesMissing = 0;
  let pendingDomainRequirementCount = 0;
  let designContractOnlyCount = 0;
  let unknownAttributionCount = 0;
  let notAssessableCount = 0;

  for (const obs of observations) {
    if (obs.profileContentFingerprint) {
      profilesPresent += 1;
    } else {
      profilesMissing += 1;
    }
    if (obs.attributionStatus === 'UNKNOWN') {
      unknownAttributionCount += 1;
    }
    for (const row of obs.consumerDemand) {
      if (row.demandClassification === VsiApdsDemandClassification.PENDING_DOMAIN_APPROVAL) {
        pendingDomainRequirementCount += 1;
      }
      if (row.demandClassification === VsiApdsDemandClassification.DESIGN_CONTRACT_ONLY) {
        designContractOnlyCount += 1;
      }
      if (row.assessmentStatus === 'NOT_ASSESSABLE') {
        notAssessableCount += 1;
      }
    }
  }

  return {
    profilesPresent,
    profilesMissing,
    pendingDomainRequirementCount,
    designContractOnlyCount,
    unknownAttributionCount,
    notAssessableCount,
    correlationErrors,
  };
}
