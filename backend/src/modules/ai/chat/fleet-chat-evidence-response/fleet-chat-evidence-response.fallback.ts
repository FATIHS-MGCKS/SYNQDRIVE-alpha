import type { AiGetVehicleHealthSummaryData } from '../../tools/get-vehicle-health-summary/ai-get-vehicle-health-summary.types';
import type { AiGetVehicleLocationData } from '../../tools/get-vehicle-location/ai-get-vehicle-location.types';
import type { AiExplainOverdueReturnData } from '../../tools/explain-overdue-return/ai-explain-overdue-return.types';
import type { FleetChatEvidenceComposeInput } from './fleet-chat-evidence-response.types';
import type { FleetChatResponseType } from './fleet-chat-evidence-response.enums';
import {
  collectInconsistencyFlags,
  collectWarnings,
  getHealthData,
  getLocationData,
  getOverdueData,
  resolveDataFreshness,
  resolveVehicleRef,
} from './fleet-chat-evidence-context.util';

function useDe(language: FleetChatEvidenceComposeInput['language']): boolean {
  return language === 'de';
}

function formatTimestamp(iso: string | null, language: FleetChatEvidenceComposeInput['language']): string {
  if (!iso) {
    return language === 'de' ? 'unbekannt' : 'unknown';
  }
  try {
    return new Date(iso).toISOString();
  } catch {
    return iso;
  }
}

export function buildLocationSummaryFallback(
  input: FleetChatEvidenceComposeInput,
): string {
  const data = getLocationData(input.toolRecords);
  const de = useDe(input.language);
  const vehicle = resolveVehicleRef(input.toolRecords);
  const plate = vehicle.licensePlate ?? (de ? 'ohne Kennzeichen' : 'no plate');

  if (!data || data.availability === 'unavailable') {
    return de
      ? `Für ${plate} konnte keine Position aus den Domain-Tools geladen werden.`
      : `No position could be loaded from domain tools for ${plate}.`;
  }

  const freshness = data.freshness;
  const observed = formatTimestamp(data.observedAt, input.language);
  const coords =
    data.latitude != null && data.longitude != null
      ? `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`
      : de
        ? 'Koordinaten nicht verfügbar'
        : 'coordinates unavailable';

  if (data.isLastKnownLocation || freshness !== 'live') {
    return de
      ? `Letzte bekannte Position für ${plate}: ${coords}. Beobachtet: ${observed} (Frische: ${freshness}). Nicht als aktuell darstellen.`
      : `Last-known position for ${plate}: ${coords}. Observed: ${observed} (freshness: ${freshness}). Do not present as current.`;
  }

  return de
    ? `Live-Position für ${plate}: ${coords}. Beobachtet: ${observed} (Frische: ${freshness}). Quelle: ${data.source}.`
    : `Live position for ${plate}: ${coords}. Observed: ${observed} (freshness: ${freshness}). Source: ${data.source}.`;
}

export function buildHealthSummaryFallback(input: FleetChatEvidenceComposeInput): string {
  const data = getHealthData(input.toolRecords);
  const de = useDe(input.language);
  const vehicle = resolveVehicleRef(input.toolRecords);
  const plate = vehicle.licensePlate ?? (de ? 'ohne Kennzeichen' : 'no plate');

  if (!data) {
    return de
      ? `Für ${plate} konnte keine Gesundheitszusammenfassung geladen werden.`
      : `No health summary could be loaded for ${plate}.`;
  }

  const limited = data.limitedData;
  const status = data.overallStatus;
  const updated = formatTimestamp(data.lastUpdatedAt, input.language);
  const blockers =
    (data.readyToRentBlockers?.length ?? 0) > 0
      ? data.readyToRentBlockers.join(', ')
      : de
        ? 'keine'
        : 'none';

  if (limited) {
    return de
      ? `Gesundheit für ${plate}: Limited Data — Gesamtstatus ${status}, aktualisiert ${updated}. Blocker: ${blockers}. Lücken in der Datenlage benennen; fehlende Domänen ≠ „alles in Ordnung“.`
      : `Health for ${plate}: Limited Data — overall ${status}, updated ${updated}. Blockers: ${blockers}. Name data gaps; missing ≠ all clear.`;
  }

  return de
    ? `Gesundheit für ${plate}: Gesamtstatus ${status}, aktualisiert ${updated}. Mietblocker: ${blockers}.`
    : `Health for ${plate}: overall ${status}, updated ${updated}. Rental blockers: ${blockers}.`;
}

export function buildOverdueExplanationFallback(
  input: FleetChatEvidenceComposeInput,
): string {
  const data = getOverdueData(input.toolRecords);
  const de = useDe(input.language);
  const vehicle = resolveVehicleRef(input.toolRecords);
  const plate = vehicle.licensePlate ?? (de ? 'ohne Kennzeichen' : 'no plate');

  if (!data) {
    return de
      ? `Für ${plate} konnte keine überfällige-Rückgabe-Erklärung geladen werden.`
      : `No overdue-return explanation could be loaded for ${plate}.`;
  }

  const explanation = data.explanation?.trim();
  const reasons =
    data.reasonCodes?.length > 0
      ? data.reasonCodes.join(', ')
      : de
        ? 'keine Reason Codes'
        : 'no reason codes';

  if (explanation) {
    return de
      ? `Überfällige Rückgabe für ${plate}: ${explanation} (Ursachen: ${reasons}).`
      : `Overdue return for ${plate}: ${explanation} (reason codes: ${reasons}).`;
  }

  return de
    ? `Überfällige Rückgabe für ${plate} — Ursachen: ${reasons}.`
    : `Overdue return for ${plate} — reason codes: ${reasons}.`;
}

export function buildDeterministicFallback(
  input: FleetChatEvidenceComposeInput,
  responseType: FleetChatResponseType,
): string {
  switch (responseType) {
    case 'LOCATION_SUMMARY':
      return buildLocationSummaryFallback(input);
    case 'HEALTH_SUMMARY':
      return buildHealthSummaryFallback(input);
    case 'OVERDUE_EXPLANATION':
      return buildOverdueExplanationFallback(input);
    case 'BOOKING_SUMMARY':
      return input.language === 'de'
        ? 'Buchungskontext aus Domain-Tools — Kundendaten nur mit Berechtigung.'
        : 'Booking context from domain tools — customer data only with permission.';
    case 'COMBINED_SUMMARY': {
      const parts = [
        buildLocationSummaryFallback(input),
        buildHealthSummaryFallback(input),
        buildOverdueExplanationFallback(input),
      ].filter((part, index, arr) => part.trim().length > 0 && arr.indexOf(part) === index);
      const de = input.language === 'de';
      const header = de ? 'Kombinierte Fahrzeugzusammenfassung:' : 'Combined vehicle summary:';
      return parts.length > 0 ? `${header}\n${parts.join('\n')}` : buildDeterministicFallback(input, 'PARTIAL_DATA');
    }
    case 'PERMISSION_RESTRICTED':
      return input.language === 'de'
        ? 'Für diese Anfrage fehlen Berechtigungen. Bitte Zugriff in SynqDrive anfordern.'
        : 'Permission denied for this request. Please request access in SynqDrive.';
    case 'AMBIGUITY_QUESTION':
      return (
        (input.language === 'de'
          ? input.route.clarificationNeeded?.messageDe
          : input.route.clarificationNeeded?.messageEn) ??
        (input.language === 'de'
          ? 'Bitte präzisieren Sie Ihre Frage.'
          : 'Please clarify your question.')
      );
    case 'INCONSISTENT_STATE': {
      const flags = collectInconsistencyFlags(input.toolRecords);
      return input.language === 'de'
        ? `Inkonsistenter Status: ${flags.join(', ')}. Keine Schönfärbung — Domain-Kontext nennen.`
        : `Inconsistent status: ${flags.join(', ')}. Surface conflicts without smoothing.`;
    }
    case 'PARTIAL_DATA':
      return input.language === 'de'
        ? 'Nur teilweise Daten verfügbar — bekannte Fakten und Lücken getrennt darstellen.'
        : 'Only partial data available — separate known facts from gaps.';
    case 'TEMPORARY_UNAVAILABLE':
      return input.language === 'de'
        ? 'Der Assistent konnte die Anfrage gerade nicht verarbeiten. Bitte erneut versuchen.'
        : 'The assistant could not process your request right now. Please try again.';
    default:
      return input.language === 'de'
        ? 'Ich konnte keine passenden Domain-Daten für eine Antwort laden.'
        : 'I could not load matching domain data for an answer.';
  }
}
