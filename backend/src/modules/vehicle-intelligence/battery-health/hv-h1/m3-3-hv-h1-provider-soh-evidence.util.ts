import type { BatteryEvidence } from '@prisma/client';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
} from '@prisma/client';

export function isHvH1QualifiedProviderSohEvidenceRow(
  row: Pick<
    BatteryEvidence,
    'scope' | 'valueType' | 'sourceType' | 'numericValue' | 'observedAt' | 'provider'
  >,
  evaluationAt: Date,
): boolean {
  if (row.scope !== BatteryEvidenceScope.HV) return false;
  if (row.valueType !== BatteryEvidenceValueType.SOH_PERCENT) return false;
  if (row.sourceType !== BatteryEvidenceSourceType.PROVIDER_REPORTED) return false;
  if (!row.provider || row.provider.trim().length === 0) return false;
  if (row.observedAt.getTime() > evaluationAt.getTime()) return false;
  if (!Number.isFinite(row.numericValue)) return false;
  if (row.numericValue < 0 || row.numericValue > 100) return false;
  return true;
}
