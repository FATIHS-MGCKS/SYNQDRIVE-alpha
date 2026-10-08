#!/usr/bin/env node
/**
 * One-off helper: inserts master.cv offboard keys into all 9 locale dictionaries.
 * Run once during VO5C-P2A; keys remain authoritative in locale TS files.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const locales = ['en', 'de', 'pl', 'fr', 'cs', 'nl', 'es', 'tr', 'it'];

const blocks = {
  en: `
  // ─── Master — Connected Vehicles offboard (VO5C-P2A) ───
  'master.cv.registryLifecycle.active': 'Active',
  'master.cv.registryLifecycle.offboarded': 'Offboarded',
  'master.cv.registryLifecycle.archived': 'Archived',
  'master.cv.registryLifecycle.unknown': 'Lifecycle unknown',
  'master.cv.registryLifecycle.filter.active': 'Active fleet',
  'master.cv.registryLifecycle.filter.offboarded': 'Offboarded history',
  'master.cv.registryLifecycle.filter.archived': 'Archived',
  'master.cv.registryLifecycle.filter.all': 'All lifecycles',
  'master.cv.offboard.action': 'Remove from active fleet',
  'master.cv.offboard.dialog.title': 'Remove vehicle from active fleet',
  'master.cv.offboard.dialog.description': 'This offboards the vehicle from SynqDrive active operations. The canonical vehicle record and history are retained.',
  'master.cv.offboard.dialog.confirm': 'Confirm offboard',
  'master.cv.offboard.dialog.cancel': 'Cancel',
  'master.cv.offboard.dialog.submitting': 'Offboarding…',
  'master.cv.offboard.organizationLabel': 'Organization',
  'master.cv.offboard.reason.label': 'Offboard reason',
  'master.cv.offboard.reason.OFFBOARD_SOLD': 'Vehicle sold',
  'master.cv.offboard.reason.REMOVE_FROM_PRODUCT': 'Remove from SynqDrive active product fleet',
  'master.cv.offboard.reason.ADMINISTRATIVE_OFFBOARD': 'Administrative offboard',
  'master.cv.offboard.note.label': 'Audit note (optional)',
  'master.cv.offboard.note.hint': 'Internal note for audit trail',
  'master.cv.offboard.explainer.title': 'What happens',
  'master.cv.offboard.explainer.canonicalRetained': 'The canonical vehicle record remains stored.',
  'master.cv.offboard.explainer.historyRetained': 'Trips, bookings, damages, service, and other history are retained.',
  'master.cv.offboard.explainer.leavesActiveFleet': 'The vehicle leaves the active product fleet.',
  'master.cv.offboard.explainer.billingAsync': 'Billing quantity updates asynchronously via the lifecycle outbox.',
  'master.cv.offboard.explainer.localLinksDeactivated': 'Local provider links and consent are deactivated per platform policy.',
  'master.cv.offboard.explainer.noProviderDisconnect': 'Provider-side account or device disconnection is a separate action.',
  'master.cv.offboard.explainer.noReOnboard': 'Ordinary automatic re-onboarding is not available.',
  'master.cv.offboard.success.title': 'Vehicle offboarded',
  'master.cv.offboard.success.replay': 'Offboard already completed (idempotent replay).',
  'master.cv.offboard.error.generic': 'Offboard could not be completed.',
  'master.cv.offboard.error.enrollment': 'MFA enrollment is required before this action.',
  'master.cv.offboard.error.operationalBlocked': 'Operational preconditions block offboarding.',
  'master.cv.offboard.block.ACTIVE_RENTAL': 'Active rental in progress',
  'master.cv.offboard.block.ACTIVE_BOOKING': 'Committed future booking exists',
  'master.cv.offboard.block.ONGOING_TRIP': 'Trip is ongoing',
  'master.cv.offboard.block.OPEN_HANDOVER': 'Pickup handover is open',
  'master.cv.offboard.warning.OPEN_DAMAGE_WARNING': 'Open damage records remain on file.',
  'master.cv.offboard.warning.OPEN_MAINTENANCE_WARNING': 'Open maintenance work remains on file.',
  'master.cv.offboard.warning.UNPAID_BILLING_WARNING': 'Unpaid billing items may remain.',
  'master.cv.offboard.warning.FLEET_TASK_WARNING': 'Open fleet tasks remain on file.',
  'master.cv.offboard.lifecycleUnknown': 'Registry lifecycle is unknown; offboard is not available.',
  'master.cv.offboard.uncertainRetry': 'Result uncertain — retry with the same operation or refresh status.',
  'master.cv.release.blockedBackend': 'Offboard is disabled until production backend capability is verified.',
`,
  de: `
  // ─── Master — Connected Vehicles offboard (VO5C-P2A) ───
  'master.cv.registryLifecycle.active': 'Aktiv',
  'master.cv.registryLifecycle.offboarded': 'Aus dem Bestand',
  'master.cv.registryLifecycle.archived': 'Archiviert',
  'master.cv.registryLifecycle.unknown': 'Lebenszyklus unbekannt',
  'master.cv.registryLifecycle.filter.active': 'Aktiver Bestand',
  'master.cv.registryLifecycle.filter.offboarded': 'Ausgebuchte Historie',
  'master.cv.registryLifecycle.filter.archived': 'Archiviert',
  'master.cv.registryLifecycle.filter.all': 'Alle Lebenszyklen',
  'master.cv.offboard.action': 'Aus aktivem Bestand entfernen',
  'master.cv.offboard.dialog.title': 'Fahrzeug aus dem aktiven Bestand entfernen',
  'master.cv.offboard.dialog.description': 'Das Fahrzeug wird aus dem aktiven SynqDrive-Betrieb ausgebucht. Der kanonische Datensatz und die Historie bleiben erhalten.',
  'master.cv.offboard.dialog.confirm': 'Ausbuchung bestätigen',
  'master.cv.offboard.dialog.cancel': 'Abbrechen',
  'master.cv.offboard.dialog.submitting': 'Wird ausgebucht…',
  'master.cv.offboard.organizationLabel': 'Organisation',
  'master.cv.offboard.reason.label': 'Ausbuchungsgrund',
  'master.cv.offboard.reason.OFFBOARD_SOLD': 'Fahrzeug verkauft',
  'master.cv.offboard.reason.REMOVE_FROM_PRODUCT': 'Aus dem aktiven SynqDrive-Produktbestand entfernen',
  'master.cv.offboard.reason.ADMINISTRATIVE_OFFBOARD': 'Administrative Ausbuchung',
  'master.cv.offboard.note.label': 'Audit-Notiz (optional)',
  'master.cv.offboard.note.hint': 'Interne Notiz für den Audit-Trail',
  'master.cv.offboard.explainer.title': 'Was passiert',
  'master.cv.offboard.explainer.canonicalRetained': 'Der kanonische Fahrzeugdatensatz bleibt gespeichert.',
  'master.cv.offboard.explainer.historyRetained': 'Fahrten, Buchungen, Schäden, Service und andere Historie bleiben erhalten.',
  'master.cv.offboard.explainer.leavesActiveFleet': 'Das Fahrzeug verlässt den aktiven Produktbestand.',
  'master.cv.offboard.explainer.billingAsync': 'Die Abrechnungsmenge wird asynchron über die Lifecycle-Outbox aktualisiert.',
  'master.cv.offboard.explainer.localLinksDeactivated': 'Lokale Provider-Links und Einwilligungen werden gemäß Plattformrichtlinie deaktiviert.',
  'master.cv.offboard.explainer.noProviderDisconnect': 'Die Provider-seitige Konto- oder Gerätetrennung ist eine separate Aktion.',
  'master.cv.offboard.explainer.noReOnboard': 'Eine automatische Wiederaufnahme ist nicht verfügbar.',
  'master.cv.offboard.success.title': 'Fahrzeug ausgebucht',
  'master.cv.offboard.success.replay': 'Ausbuchung bereits abgeschlossen (idempotenter Replay).',
  'master.cv.offboard.error.generic': 'Ausbuchung konnte nicht abgeschlossen werden.',
  'master.cv.offboard.error.enrollment': 'MFA-Registrierung ist für diese Aktion erforderlich.',
  'master.cv.offboard.error.operationalBlocked': 'Operative Voraussetzungen verhindern die Ausbuchung.',
  'master.cv.offboard.block.ACTIVE_RENTAL': 'Aktive Miete läuft',
  'master.cv.offboard.block.ACTIVE_BOOKING': 'Verbindliche zukünftige Buchung vorhanden',
  'master.cv.offboard.block.ONGOING_TRIP': 'Fahrt läuft',
  'master.cv.offboard.block.OPEN_HANDOVER': 'Abhol-Übergabe ist offen',
  'master.cv.offboard.warning.OPEN_DAMAGE_WARNING': 'Offene Schadensfälle bleiben gespeichert.',
  'master.cv.offboard.warning.OPEN_MAINTENANCE_WARNING': 'Offene Wartungsarbeiten bleiben gespeichert.',
  'master.cv.offboard.warning.UNPAID_BILLING_WARNING': 'Unbezahlte Abrechnungspositionen können verbleiben.',
  'master.cv.offboard.warning.FLEET_TASK_WARNING': 'Offene Flottenaufgaben bleiben gespeichert.',
  'master.cv.offboard.lifecycleUnknown': 'Registry-Lebenszyklus unbekannt; Ausbuchung nicht verfügbar.',
  'master.cv.offboard.uncertainRetry': 'Ergebnis unklar — mit derselben Operation erneut versuchen oder Status aktualisieren.',
  'master.cv.release.blockedBackend': 'Ausbuchung ist deaktiviert, bis die Backend-Fähigkeit in Produktion verifiziert ist.',
`,
};

// For non-en/de locales, use English block as base and translators can refine — but rules forbid ...en spread.
// Provide proper native strings for each locale (abbreviated quality but with diacritics).

const plBlock = blocks.en.replace(/Active/g, 'Aktywny').replace(/Offboard/g, 'Wycofany'); // placeholder - need proper pl

// Instead embed full translations per locale in script - long but required
