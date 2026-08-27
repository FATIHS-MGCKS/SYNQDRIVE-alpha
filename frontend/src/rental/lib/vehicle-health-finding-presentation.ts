/**
 * Stage 3A — Shared presentation resolver for activeHealthFindings[].
 *
 * Machine-readable finding data is authority; rendered strings are never used
 * to select icons, severity, or aggregation behavior.
 */
import type { StatusTone } from '../../components/patterns';
import type { TranslationKey } from '../i18n/translations/en';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import vhBrakeIcon from '../../assets/icons/vehicle-health/brake.svg';
import vhMotorFilterIcon from '../../assets/icons/vehicle-health/motor-filter.svg';
import vhCarBatteryIcon from '../../assets/icons/vehicle-health/car-battery.svg';
import tellTaleCelIcon from '../../assets/icons/telltale/cel.svg';
import {
  ACTIVE_HEALTH_FINDING_TYPE,
  type ActiveHealthFinding,
  type ActiveHealthFindingSeverity,
  type ActiveHealthFindingType,
} from './vehicle-row-operational-projection';
import { resolveDashboardTelltaleIconSrc } from './dashboard-warning-lights-display';

export type VehicleHealthFindingIconKind = 'vehicle_health_svg' | 'telltale_svg' | 'lucide';

export interface VehicleHealthFindingPresentation {
  stableKey: string;
  findingType: ActiveHealthFindingType;
  severity: ActiveHealthFindingSeverity;
  tone: StatusTone;
  iconKind: VehicleHealthFindingIconKind;
  iconSrc: string;
  /** Applied to vehicle-health tire icon (matches VehicleHealthBox). */
  iconClassName?: string;
  lucideIconName?: 'wrench' | 'shield-alert';
  localizationKey: TranslationKey;
  domainLabelKey: TranslationKey;
  severityLabelKey: TranslationKey;
  telltaleKey?: string;
  count?: number;
  sourceFindings: ActiveHealthFinding[];
}

export interface ResolveVehicleHealthFindingPresentationInput {
  locale?: 'en' | 'de';
  t?: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const DOMAIN_LABEL_KEYS: Record<ActiveHealthFindingType, TranslationKey> = {
  [ACTIVE_HEALTH_FINDING_TYPE.TIRE]: 'fleet.healthFinding.domain.tire',
  [ACTIVE_HEALTH_FINDING_TYPE.BRAKE]: 'fleet.healthFinding.domain.brake',
  [ACTIVE_HEALTH_FINDING_TYPE.BATTERY]: 'fleet.healthFinding.domain.battery',
  [ACTIVE_HEALTH_FINDING_TYPE.DTC]: 'fleet.healthFinding.domain.dtc',
  [ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING]: 'fleet.healthFinding.domain.dashboardWarning',
  [ACTIVE_HEALTH_FINDING_TYPE.SERVICE]: 'fleet.healthFinding.domain.service',
  [ACTIVE_HEALTH_FINDING_TYPE.COMPLIANCE]: 'fleet.healthFinding.domain.compliance',
};

const TELLTALE_LABEL_KEYS: Record<string, TranslationKey> = {
  engine_oil_level: 'fleet.healthFinding.telltale.engineOilLevel',
  engine_limp_mode: 'fleet.healthFinding.telltale.engineLimpMode',
  check_engine_light: 'fleet.healthFinding.telltale.checkEngineLight',
  brake_lining_wear_pre_warning: 'fleet.healthFinding.telltale.brakeLiningWear',
  tire_pressure_warning: 'fleet.healthFinding.telltale.tirePressureWarning',
  battery_warning_light: 'fleet.healthFinding.telltale.batteryWarningLight',
};

const FINDING_TYPE_ORDER: ActiveHealthFindingType[] = [
  ACTIVE_HEALTH_FINDING_TYPE.DTC,
  ACTIVE_HEALTH_FINDING_TYPE.SERVICE,
  ACTIVE_HEALTH_FINDING_TYPE.COMPLIANCE,
  ACTIVE_HEALTH_FINDING_TYPE.BRAKE,
  ACTIVE_HEALTH_FINDING_TYPE.TIRE,
  ACTIVE_HEALTH_FINDING_TYPE.BATTERY,
  ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
];

function defaultTranslator(locale: 'en' | 'de'): (key: TranslationKey, vars?: Record<string, string | number>) => string {
  const dict = locale === 'de' ? de : en;
  return (key, vars) => {
    let value = dict[key] ?? key;
    if (vars) {
      for (const [name, replacement] of Object.entries(vars)) {
        value = value.replace(`{${name}}`, String(replacement));
      }
    }
    return value;
  };
}

function severityToTone(severity: ActiveHealthFindingSeverity): StatusTone {
  return severity === 'critical' ? 'critical' : 'watch';
}

function severityLabelKey(severity: ActiveHealthFindingSeverity): TranslationKey {
  return severity === 'critical'
    ? 'fleet.healthFinding.severity.critical'
    : 'fleet.healthFinding.severity.warning';
}

function severityRank(severity: ActiveHealthFindingSeverity): number {
  return severity === 'critical' ? 0 : 1;
}

function findingTypeRank(type: ActiveHealthFindingType): number {
  const index = FINDING_TYPE_ORDER.indexOf(type);
  return index === -1 ? FINDING_TYPE_ORDER.length : index;
}

function resolveTelltaleKey(finding: ActiveHealthFinding): string {
  const key = finding.metadata?.telltaleKey;
  return typeof key === 'string' && key.length > 0 ? key : 'unknown_telltale';
}

function resolveDomainLabelKey(finding: ActiveHealthFinding): TranslationKey {
  if (finding.type === ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING) {
    const telltaleKey = resolveTelltaleKey(finding);
    return TELLTALE_LABEL_KEYS[telltaleKey] ?? 'fleet.healthFinding.telltale.unknown';
  }
  return DOMAIN_LABEL_KEYS[finding.type];
}

function resolveIconForFinding(finding: ActiveHealthFinding): Pick<
  VehicleHealthFindingPresentation,
  'iconKind' | 'iconSrc' | 'iconClassName' | 'lucideIconName' | 'telltaleKey'
> {
  switch (finding.type) {
    case ACTIVE_HEALTH_FINDING_TYPE.TIRE:
      return {
        iconKind: 'vehicle_health_svg',
        iconSrc: vhMotorFilterIcon,
        iconClassName: 'rotate-90',
      };
    case ACTIVE_HEALTH_FINDING_TYPE.BRAKE:
      return {
        iconKind: 'vehicle_health_svg',
        iconSrc: vhBrakeIcon,
      };
    case ACTIVE_HEALTH_FINDING_TYPE.BATTERY:
      return {
        iconKind: 'vehicle_health_svg',
        iconSrc: vhCarBatteryIcon,
      };
    case ACTIVE_HEALTH_FINDING_TYPE.DTC:
      return {
        iconKind: 'telltale_svg',
        iconSrc: tellTaleCelIcon,
      };
    case ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING: {
      const telltaleKey = resolveTelltaleKey(finding);
      return {
        iconKind: 'telltale_svg',
        iconSrc: resolveDashboardTelltaleIconSrc(telltaleKey),
        telltaleKey,
      };
    }
    case ACTIVE_HEALTH_FINDING_TYPE.SERVICE:
      return {
        iconKind: 'lucide',
        iconSrc: '',
        lucideIconName: 'wrench',
      };
    case ACTIVE_HEALTH_FINDING_TYPE.COMPLIANCE:
      return {
        iconKind: 'lucide',
        iconSrc: '',
        lucideIconName: 'shield-alert',
      };
    default:
      return {
        iconKind: 'telltale_svg',
        iconSrc: tellTaleCelIcon,
      };
  }
}

function mergeSeverity(
  current: ActiveHealthFindingSeverity,
  incoming: ActiveHealthFindingSeverity,
): ActiveHealthFindingSeverity {
  return severityRank(incoming) < severityRank(current) ? incoming : current;
}

function sumCounts(findings: ActiveHealthFinding[]): number | undefined {
  const total = findings.reduce((sum, finding) => sum + (finding.count ?? 1), 0);
  return total > 1 ? total : findings.length > 1 ? findings.length : findings[0]?.count;
}

export function resolveVehicleHealthFindingPresentation(
  finding: ActiveHealthFinding,
  input: ResolveVehicleHealthFindingPresentationInput = {},
): VehicleHealthFindingPresentation {
  const icon = resolveIconForFinding(finding);
  return {
    stableKey: buildStableKeyForFinding(finding),
    findingType: finding.type,
    severity: finding.severity,
    tone: severityToTone(finding.severity),
    localizationKey: finding.localizationKey,
    domainLabelKey: resolveDomainLabelKey(finding),
    severityLabelKey: severityLabelKey(finding.severity),
    count: finding.count,
    sourceFindings: [finding],
    ...icon,
  };
}

export function buildStableKeyForFinding(finding: ActiveHealthFinding): string {
  if (finding.type === ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING) {
    return `${finding.type}:${resolveTelltaleKey(finding)}`;
  }
  return `${finding.type}:${finding.reasonCode}`;
}

export function aggregateActiveHealthFindingsForDisplay(
  findings: ActiveHealthFinding[],
): VehicleHealthFindingPresentation[] {
  const domainBuckets = new Map<string, ActiveHealthFinding[]>();
  const dashboardBuckets = new Map<string, ActiveHealthFinding[]>();

  for (const finding of findings) {
    if (finding.type === ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING) {
      const key = resolveTelltaleKey(finding);
      const bucket = dashboardBuckets.get(key) ?? [];
      bucket.push(finding);
      dashboardBuckets.set(key, bucket);
      continue;
    }

    const key = finding.type;
    const bucket = domainBuckets.get(key) ?? [];
    bucket.push(finding);
    domainBuckets.set(key, bucket);
  }

  const aggregated: VehicleHealthFindingPresentation[] = [];

  for (const [type, bucket] of domainBuckets.entries()) {
    const severity = bucket.reduce(
      (current, finding) => mergeSeverity(current, finding.severity),
      bucket[0]!.severity,
    );
    const representative = bucket[0]!;
    const presentation = resolveVehicleHealthFindingPresentation({
      ...representative,
      severity,
      count: type === ACTIVE_HEALTH_FINDING_TYPE.DTC ? sumCounts(bucket) : representative.count,
    });
    presentation.stableKey = type;
    presentation.sourceFindings = bucket;
    aggregated.push(presentation);
  }

  for (const [telltaleKey, bucket] of dashboardBuckets.entries()) {
    const severity = bucket.reduce(
      (current, finding) => mergeSeverity(current, finding.severity),
      bucket[0]!.severity,
    );
    const representative = bucket[0]!;
    const presentation = resolveVehicleHealthFindingPresentation({
      ...representative,
      severity,
    });
    presentation.stableKey = `${ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING}:${telltaleKey}`;
    presentation.sourceFindings = bucket;
    aggregated.push(presentation);
  }

  return sortAggregatedHealthFindingPresentations(aggregated);
}

export function sortAggregatedHealthFindingPresentations(
  presentations: VehicleHealthFindingPresentation[],
): VehicleHealthFindingPresentation[] {
  return [...presentations].sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    const byType = findingTypeRank(a.findingType) - findingTypeRank(b.findingType);
    if (byType !== 0) return byType;
    return (a.telltaleKey ?? a.stableKey).localeCompare(b.telltaleKey ?? b.stableKey, 'en');
  });
}

export function splitAggregatedFindingsForDisplay(
  presentations: VehicleHealthFindingPresentation[],
  maxVisible: number,
): {
  visible: VehicleHealthFindingPresentation[];
  overflow: VehicleHealthFindingPresentation[];
} {
  if (maxVisible <= 0) {
    return { visible: [], overflow: presentations };
  }
  if (presentations.length <= maxVisible) {
    return { visible: presentations, overflow: [] };
  }
  const reserveOverflowSlot = presentations.length > maxVisible;
  const visibleCount = reserveOverflowSlot ? Math.max(1, maxVisible - 1) : presentations.length;
  return {
    visible: presentations.slice(0, visibleCount),
    overflow: presentations.slice(visibleCount),
  };
}

export function buildVehicleHealthFindingAccessibleLabel(
  presentation: VehicleHealthFindingPresentation,
  input: ResolveVehicleHealthFindingPresentationInput = {},
): string {
  const locale = input.locale ?? 'de';
  const t = input.t ?? defaultTranslator(locale);
  const domain = t(presentation.domainLabelKey);
  const severity = t(presentation.severityLabelKey);

  if (presentation.findingType === ACTIVE_HEALTH_FINDING_TYPE.DTC && presentation.count && presentation.count > 1) {
    return t('fleet.healthFinding.dtcCountLabel', {
      count: presentation.count,
      severity,
    });
  }

  return t('fleet.healthFinding.tooltipLabel', { domain, severity });
}

export function buildVehicleHealthFindingTooltip(
  presentation: VehicleHealthFindingPresentation,
  input: ResolveVehicleHealthFindingPresentationInput = {},
): string {
  return buildVehicleHealthFindingAccessibleLabel(presentation, input);
}

export function buildOverflowAccessibleLabel(
  overflow: VehicleHealthFindingPresentation[],
  input: ResolveVehicleHealthFindingPresentationInput = {},
): string {
  const locale = input.locale ?? 'de';
  const t = input.t ?? defaultTranslator(locale);
  const labels = overflow.map((item) => buildVehicleHealthFindingAccessibleLabel(item, input));
  return `${t('fleet.healthFinding.overflow', { count: overflow.length })} — ${labels.join('; ')}`;
}

/**
 * Cross-domain duplicate policy (Stage 3A):
 * - Health-domain findings (TIRE/BRAKE/BATTERY/DTC/SERVICE) and dashboard telltales are distinct evidence.
 * - e.g. TIRE rental-health finding + TPMS telltale both render.
 * - No cross-domain deduplication.
 */
export const HEALTH_FINDING_CROSS_DOMAIN_DEDUPE = false as const;
