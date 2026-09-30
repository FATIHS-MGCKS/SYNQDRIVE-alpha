import type { HvCapacityMethod } from '../hv-method-profile/hv-method-profile.types';
import { HV_M2_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { HV_M3_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m3.types';
import { HvCapacityMethod as PrismaHvCapacityMethod } from '../battery-v2-domain';

export interface M3_3HvH2MethodInventoryRow {
  persistedMethod: PrismaHvCapacityMethod | 'BatteryEvidence';
  h2LogicalMethod: HvCapacityMethod | null;
  sourceAuthority: string;
  valueSemantic: string | null;
  h2Role: string | null;
  supportedNow: boolean;
}

export const M3_3_HV_H2_METHOD_INVENTORY: M3_3HvH2MethodInventoryRow[] = [
  {
    persistedMethod: HV_M2_CAPACITY_METHOD,
    h2LogicalMethod: 'M2_CURRENT_ENERGY_SOC',
    sourceAuthority: 'HvCapacityObservation + hv-capacity-shadow M2 gates (metadata)',
    valueSemantic: 'ESTIMATED_USABLE_CAPACITY_KWH',
    h2Role: 'METHOD_SHADOW_EVIDENCE',
    supportedNow: true,
  },
  {
    persistedMethod: HV_M3_CAPACITY_METHOD,
    h2LogicalMethod: 'M3_ADDED_ENERGY_DELTA_SOC',
    sourceAuthority: 'HvCapacityObservation + hv-capacity-shadow M3 validation gates',
    valueSemantic: 'ESTIMATED_USABLE_CAPACITY_KWH',
    h2Role: 'VALIDATION_ONLY',
    supportedNow: true,
  },
  {
    persistedMethod: PrismaHvCapacityMethod.SESSION_DELTA_ENERGY_SOC,
    h2LogicalMethod: null,
    sourceAuthority: 'enum only — no H2 longitudinal producer audited',
    valueSemantic: null,
    h2Role: null,
    supportedNow: false,
  },
  {
    persistedMethod: PrismaHvCapacityMethod.SHADOW_ROLLING_MEDIAN,
    h2LogicalMethod: null,
    sourceAuthority: 'cross-session aggregate — not raw H2 candidate',
    valueSemantic: null,
    h2Role: null,
    supportedNow: false,
  },
  {
    persistedMethod: PrismaHvCapacityMethod.PROVIDER_GROSS_CAPACITY,
    h2LogicalMethod: null,
    sourceAuthority: 'reference context only',
    valueSemantic: null,
    h2Role: null,
    supportedNow: false,
  },
  {
    persistedMethod: PrismaHvCapacityMethod.LEGACY_PAIRWISE_POLL,
    h2LogicalMethod: null,
    sourceAuthority: 'legacy — no H2 candidate path',
    valueSemantic: null,
    h2Role: null,
    supportedNow: false,
  },
  {
    persistedMethod: 'BatteryEvidence',
    h2LogicalMethod: 'PROVIDER_HV_SOH',
    sourceAuthority: 'BatteryEvidence scope=HV valueType=SOH_PERCENT sourceType=PROVIDER_REPORTED',
    valueSemantic: 'PROVIDER_SOH_PERCENT',
    h2Role: 'PROVIDER_EVIDENCE',
    supportedNow: true,
  },
];
