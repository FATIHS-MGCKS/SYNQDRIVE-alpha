export {
  LV_CANONICAL_RESOLVER_VERSION,
  LV_CANONICAL_TRUTH_SOURCES,
  LV_CANONICAL_SCORE_SEMANTICS,
  LV_CANONICAL_SCORE_LABEL_DE,
  resolveCanonicalLvBattery,
  type CanonicalLvBatteryResponse,
  type LvCanonicalTruthSource,
} from './lv-canonical-battery.resolver';

export type {
  LvCanonicalAssessment,
  LvCanonicalChemistry,
  LvCanonicalLegacyDiagnostic,
  LvCanonicalLiveVoltage,
  LvCanonicalPrimaryTruth,
  LvCanonicalProfile,
  LvCanonicalPublication,
  LvCanonicalQuality,
  LvCanonicalRestMeasurement,
  LvCanonicalStartProxy,
  ResolveCanonicalLvBatteryInput,
} from './lv-canonical-battery.types';

export { LvCanonicalBatteryResolverService } from './lv-canonical-battery-resolver.service';
