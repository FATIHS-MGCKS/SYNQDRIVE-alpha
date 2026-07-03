import type {
  OperationalIssue,
  OperationalIssueEvidence,
  OperationalIssueInvoiceLike,
  OperationalIssueBookingLike,
  OperationalIssueCustomerLike,
  OperationalIssueLocale,
  OperationalIssueVehicleLike,
} from './operationalIssueTypes';

export interface UserFacingReasonLike {
  title?: string | null;
  description?: string | null;
  source?: string | null;
  category?: string | null;
  issueType?: string | null;
}

const TECHNICAL_SOURCE_PATTERNS: RegExp[] = [
  /\brental-health:[a-z0-9_:-]+\b/gi,
  /\bdashboard-insight:[a-z0-9_:-]+\b/gi,
  /\bvehicle-runtime\b/gi,
  /\bdashboard-health-risk\b/gi,
  /\bpredictive-operations\b/gi,
  /\bSERVICE_OVERDUE\b/g,
  /\bSERVICE_WINDOW\b/g,
  /\bCOLD_ENGINE_ABUSE\b/g,
  /\bCOLD_ENGINE_HIGH_RPM\b/g,
  /\bCOLD_ENGINE_FULL_THROTTLE\b/g,
  /\bHARSH_ACCELERATION\b/g,
  /\bHARSH_BRAKING\b/g,
  /\bPOSSIBLE_IMPACT\b/g,
  /\bDIMO_COLLISION_REPORTED\b/g,
  /\bMISUSE_CASE\b/g,
  /\bUNKNOWN\b/g,
  /\bUNKNOWN\s*·\s*UNKNOWN\b/gi,
];

const RAW_TITLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/^Health review required$/i, 'Health pruefen'],
  [/^Critical vehicle health$/i, 'Fahrzeugzustand kritisch'],
  [/^Warning health status$/i, 'Fahrzeugzustand pruefen'],
  [/^Service Window Available$/i, 'Servicefenster verfügbar'],
  [/^DTC stale$/i, 'Fehlercode-Datenstand verzoegert'],
];

export function formatVehicleIssueEntityLabel(input: OperationalIssueVehicleLike | null | undefined): string {
  if (!input) return 'Fahrzeug';
  const license = cleanPart(input.license);
  const make = cleanPart(input.make);
  const model = cleanPart(input.model);
  const year = cleanPart(input.year);
  const vehicleName = [make, model, year].filter(Boolean).join(' ');

  if (license && vehicleName) return `${license} · ${vehicleName}`;
  if (license) return license;
  if (vehicleName) return vehicleName;
  return cleanPart(input.displayName) || cleanPart(input.name) || 'Fahrzeug';
}

export function formatBookingIssueEntityLabel(input: OperationalIssueBookingLike | null | undefined): string {
  if (!input) return 'Buchung';
  const bookingLabel = cleanPart(input.bookingNumber) || shortId(input.bookingId ?? input.id, 'Buchung');
  const customer = cleanPart(input.customerName);
  const pickup = cleanPart(input.pickupAt) || cleanPart(input.startDate) || cleanPart(input.startTime);
  return [bookingLabel, customer, pickup].filter(Boolean).join(' · ') || 'Buchung';
}

export function formatCustomerIssueEntityLabel(input: OperationalIssueCustomerLike | null | undefined): string {
  if (!input) return 'Kunde';
  const fullName = [cleanPart(input.firstName), cleanPart(input.lastName)].filter(Boolean).join(' ');
  return fullName || cleanPart(input.name) || cleanPart(input.companyName) || shortId(input.customerId ?? input.id, 'Kunde');
}

export function formatInvoiceIssueEntityLabel(input: OperationalIssueInvoiceLike | null | undefined): string {
  if (!input) return 'Rechnung';
  const invoice = cleanPart(input.invoiceNumber) || shortId(input.invoiceId ?? input.id, 'Rechnung');
  const amount = cleanPart(input.amountLabel) || cleanPart(input.amount);
  return [invoice, cleanPart(input.customerName), amount].filter(Boolean).join(' · ') || 'Rechnung';
}

export function sanitizeUserFacingIssueText(text: string | null | undefined): string {
  if (!text) return '';
  let value = text.trim();
  for (const [pattern, replacement] of RAW_TITLE_REPLACEMENTS) {
    value = value.replace(pattern, replacement);
  }
  for (const pattern of TECHNICAL_SOURCE_PATTERNS) {
    value = value.replace(pattern, '');
  }
  return value
    .replace(/\s*·\s*·\s*/g, ' · ')
    .replace(/\s*[:|,-]\s*$/g, '')
    .replace(/^\s*[:|,-]\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function formatUserFacingReasonLabel(
  reasonOrIssue: UserFacingReasonLike | null | undefined,
  locale: OperationalIssueLocale = 'de',
): string {
  if (!reasonOrIssue) return locale === 'de' ? 'Prüfung erforderlich' : 'Review required';
  const rawTitle = reasonOrIssue.title?.trim() ?? '';
  const title = sanitizeUserFacingIssueText(rawTitle);
  if (!isGenericHealthRawTitle(rawTitle) && isUsefulUserFacingLabel(title)) return title;

  const description = sanitizeUserFacingIssueText(reasonOrIssue.description);
  if (isUsefulUserFacingLabel(description)) return description;

  const source = reasonOrIssue.source ?? '';
  const issueType = reasonOrIssue.issueType ?? '';
  const category = reasonOrIssue.category ?? '';
  return fallbackReasonLabel({ source, issueType, category, locale });
}

export function formatOperationalIssueTitle(issue: Pick<OperationalIssue, 'issueType' | 'title'>): string {
  if (
    issue.issueType === 'hm_oem_service_tracking_missing'
    || issue.issueType === 'service_tracking_missing'
  ) {
    return defaultTitleForIssueType(issue.issueType);
  }
  const sanitized = sanitizeUserFacingIssueText(issue.title);
  if (sanitized) return sanitized;
  return defaultTitleForIssueType(issue.issueType);
}

export function formatOperationalIssueSubtitle(issue: Pick<OperationalIssue, 'subtitle' | 'issueType'>): string | undefined {
  const sanitized = sanitizeUserFacingIssueText(issue.subtitle);
  return sanitized || undefined;
}

export function formatOperationalIssueEvidence(evidence: OperationalIssueEvidence): string {
  const value = [sanitizeUserFacingIssueText(evidence.value), evidence.unit].filter(Boolean).join(' ');
  const label = sanitizeUserFacingIssueText(evidence.label);
  return label ? `${label}: ${value}` : value;
}

function defaultTitleForIssueType(issueType: string): string {
  switch (issueType) {
    case 'service_overdue':
      return 'Service ueberfaellig';
    case 'service_due_soon':
      return 'Service bald faellig';
    case 'service_window_available':
      return 'Servicefenster verfuegbar';
    case 'battery_warning':
      return 'Batterie pruefen';
    case 'battery_critical':
      return 'Batterie kritisch';
    case 'tire_monitor':
      return 'Reifen beobachten';
    case 'tire_critical':
      return 'Reifen kritisch';
    case 'error_codes_active':
      return 'Fehlercodes pruefen';
    case 'telemetry_soft_offline':
      return 'Soft Offline';
    case 'telemetry_offline':
      return 'Offline';
    case 'pickup_overdue':
      return 'Abholung ueberfaellig';
    case 'return_overdue':
      return 'Rueckgabe ueberfaellig';
    case 'cold_engine_abuse':
      return 'Kaltmotor-Missbrauch erkannt';
    case 'harsh_acceleration':
      return 'Starke Beschleunigung erkannt';
    case 'harsh_braking':
      return 'Starke Bremsung erkannt';
    case 'suspicious_trip':
      return 'Auffällige Fahrt';
    case 'damage_suspicion':
      return 'Schadensverdacht';
    case 'impact_suspicion':
      return 'Impact-Verdacht';
    case 'hm_oem_service_tracking_missing':
    case 'service_tracking_missing':
      return 'Service-Tracking nicht verfuegbar';
    case 'receivable_overdue':
      return 'Zahlung ueberfaellig';
    default:
      return 'Pruefung erforderlich';
  }
}

function isUsefulUserFacingLabel(value: string): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'unknown' || normalized === 'unknown confidence') return false;
  if (normalized === 'service window available') return false;
  if (normalized === 'health review required') return false;
  if (normalized === 'critical vehicle health') return false;
  if (normalized === 'warning health status') return false;
  if (/^[a-z]+[_-][a-z0-9_-]+$/.test(normalized)) return false;
  return true;
}

function isGenericHealthRawTitle(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'health review required' ||
    normalized === 'critical vehicle health' ||
    normalized === 'warning health status'
  );
}

function fallbackReasonLabel(input: {
  source: string;
  issueType: string;
  category: string;
  locale: OperationalIssueLocale;
}): string {
  const de = input.locale === 'de';
  const source = input.source.toLowerCase();
  const issueType = input.issueType.toLowerCase();
  const category = input.category.toLowerCase();

  if (source.includes('service_compliance') || issueType.includes('service')) {
    if (issueType.includes('window')) return de ? 'Servicefenster verfügbar' : 'Service window available';
    if (issueType.includes('overdue')) return de ? 'Service überfällig' : 'Service overdue';
    return de ? 'Service prüfen' : 'Check service';
  }
  if (source.includes('error_codes') || category === 'dtc' || issueType.includes('error_codes')) {
    return de ? 'Fehlercodes prüfen' : 'Check fault codes';
  }
  if (source.includes('tires') || category === 'tires' || issueType.includes('tire')) {
    return de ? 'Reifen beobachten' : 'Monitor tires';
  }
  if (source.includes('battery') || category === 'battery' || issueType.includes('battery')) {
    return de ? 'Batterie prüfen' : 'Check battery';
  }
  if (source.includes('brakes') || category === 'brakes' || issueType.includes('brake')) {
    return de ? 'Bremsen prüfen' : 'Check brakes';
  }
  if (category === 'telemetry' || issueType.includes('telemetry')) {
    if (issueType.includes('soft_offline')) return 'Soft Offline';
    if (issueType.includes('offline')) return 'Offline';
    return de ? 'Telemetrie prüfen' : 'Check telemetry';
  }
  if (category === 'cleaning' || issueType.includes('cleaning')) return de ? 'Reinigung erforderlich' : 'Cleaning required';
  if (category === 'handover') return de ? 'Übergabe prüfen' : 'Check handover';
  if (category === 'finance') return de ? 'Finanzen prüfen' : 'Check finance';
  if (category === 'damage') return de ? 'Schaden prüfen' : 'Check damage';
  if (source.includes('dashboard-health-risk') || category === 'health' || issueType.includes('health')) {
    return de ? 'Health prüfen' : 'Check health';
  }
  return de ? 'Prüfung erforderlich' : 'Review required';
}

function cleanPart(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim();
  return text.length > 0 ? text : '';
}

function shortId(id: string | null | undefined, prefix: string): string {
  const clean = cleanPart(id);
  return clean ? `${prefix} ${clean.slice(0, 8)}` : prefix;
}

export function localizedTelemetryTitle(issueType: string, locale: OperationalIssueLocale = 'de'): string {
  if (issueType === 'telemetry_live') return 'Live';
  if (issueType === 'telemetry_standby') return 'Standby';
  if (issueType === 'telemetry_soft_offline') return locale === 'de' ? 'Soft Offline' : 'Soft Offline';
  if (issueType === 'telemetry_offline') return 'Offline';
  return locale === 'de' ? 'Unbekannt' : 'Unknown';
}
