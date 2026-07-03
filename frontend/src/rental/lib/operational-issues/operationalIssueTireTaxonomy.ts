import type { OperationalIssueSeverity } from './operationalIssueTypes';

/**
 * Canonical tire operational severity bands.
 * OperationalIssue tire paths must use these rules — no per-surface overrides.
 */
export type TireOperationalBand = 'none' | 'notice' | 'warning' | 'critical';

const TIRE_NO_ACTION_TEXT =
  /no action required|keine aktion|forecast only|nur prognose|model estimate unavailable|modellsch[aä]tzung nicht|measured forecast only|nur messprognose|kein handlungsbedarf/i;

const TIRE_CHECK_SOON_TEXT =
  /reifen beobachten|monitor tires|check soon|bald pr[uü]fen|manual measurement|manuelle messung|messung.*(bald|f[aä]llig|due)|watch|beobachten|auff[aä]llig|pr[uü]fen|tread/i;

const TIRE_CRITICAL_TEXT =
  /critical|kritisch|replace|ersetzen|unter grenzwert|below limit|safety|sicherheit|sofort/i;

export function tireBandToOperationalSeverity(
  band: TireOperationalBand,
): OperationalIssueSeverity | null {
  switch (band) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'notice':
      return 'attention';
    case 'none':
    default:
      return null;
  }
}

export function resolveTireOperationalBand(input: {
  moduleState?: string | null;
  issueType?: string | null;
  title?: string | null;
  reason?: string | null;
  actionState?: string | null;
}): TireOperationalBand {
  const issueType = (input.issueType ?? '').toLowerCase();
  const text = [input.title, input.reason].filter(Boolean).join(' ').toLowerCase();
  const state = (input.moduleState ?? '').toLowerCase();
  const actionState = (input.actionState ?? '').toUpperCase();

  if (
    issueType === 'tire_critical'
    || issueType === 'tires_critical'
    || state === 'critical'
    || TIRE_CRITICAL_TEXT.test(text)
  ) {
    return 'critical';
  }

  if (TIRE_NO_ACTION_TEXT.test(text)) {
    return 'none';
  }

  if (
    actionState === 'CHECK_SOON'
    || actionState === 'PLAN_SERVICE'
    || actionState === 'REPLACE'
    || TIRE_CHECK_SOON_TEXT.test(text)
    || state === 'warning'
    || issueType === 'tire_monitor'
    || issueType === 'tire_observe'
    || issueType === 'monitor_tires'
    || issueType === 'check_soon'
  ) {
    return 'warning';
  }

  if (/observe|beobachten/i.test(text)) {
    return 'notice';
  }

  return 'none';
}

export function isTireModuleVisibleInHealth(band: TireOperationalBand): boolean {
  return band !== 'none';
}

export function isTireModuleActionable(band: TireOperationalBand): boolean {
  return band === 'warning' || band === 'critical';
}

export function mapTireOperationalIssue(input: {
  moduleState?: string | null;
  issueType?: string | null;
  title?: string | null;
  reason?: string | null;
  actionState?: string | null;
}): {
  band: TireOperationalBand;
  severity: OperationalIssueSeverity;
  issueType: string;
  keyType: string;
  showInDashboardAttention: boolean;
} | null {
  const band = resolveTireOperationalBand(input);
  if (band === 'none') return null;

  const severity = tireBandToOperationalSeverity(band);
  const issueType = resolveTireIssueType(band);
  if (!severity || !issueType) return null;

  const keyType = band === 'critical'
    ? 'tires_critical'
    : band === 'warning'
      ? 'tires_monitor'
      : 'tires_observe';

  return {
    band,
    severity,
    issueType,
    keyType,
    showInDashboardAttention: shouldShowTireInDashboardAttention(band),
  };
}

export function resolveTireOperationalSeverity(input: {
  moduleState?: string | null;
  issueType?: string | null;
  title?: string | null;
  reason?: string | null;
  actionState?: string | null;
}): OperationalIssueSeverity | null {
  return tireBandToOperationalSeverity(resolveTireOperationalBand(input));
}

export function resolveTireIssueType(band: TireOperationalBand): string | null {
  switch (band) {
    case 'critical':
      return 'tire_critical';
    case 'warning':
      return 'tire_monitor';
    case 'notice':
      return 'tire_observe';
    case 'none':
    default:
      return null;
  }
}

export function shouldShowTireInDashboardAttention(
  band: TireOperationalBand,
): boolean {
  return band === 'warning' || band === 'critical';
}

export function isTireOperationalIssueType(issueType: string): boolean {
  const normalized = issueType.toLowerCase();
  return (
    normalized.includes('tire')
    || normalized === 'check_soon'
    || normalized === 'monitor_tires'
    || normalized === 'tire_observe'
  );
}

export function tireModuleDetailLabel(
  band: TireOperationalBand,
  de: boolean,
): string {
  switch (band) {
    case 'critical':
      return de ? 'Kritisch' : 'Critical';
    case 'warning':
      return de ? 'Warnung' : 'Warning';
    case 'notice':
      return de ? 'Hinweis' : 'Notice';
    default:
      return de ? 'OK' : 'OK';
  }
}
