import { PERMISSION_MODULE_KEYS } from '@shared/auth/permission.constants';

export interface PermissionCapabilityMeta {
  key: string;
  label: string;
  critical: boolean;
}

export const PERMISSION_DOMAIN_GROUPS: Array<{
  domain: string;
  modules: Array<{ key: string; label: string; critical: boolean }>;
}> = [
  {
    domain: 'Mandanten & Organisation',
    modules: [{ key: 'company-info', label: 'Mandantendaten', critical: true }],
  },
  {
    domain: 'Benutzer & Rollen',
    modules: [{ key: 'users-roles', label: 'Benutzer und Rollen', critical: true }],
  },
  {
    domain: 'Flotte & Fahrzeuge',
    modules: [
      { key: 'fleet', label: 'Flotte', critical: false },
      { key: 'fleet-condition', label: 'Fahrzeugzustand', critical: false },
      { key: 'fleet-connectivity', label: 'Fahrzeug-Konnektivität', critical: true },
    ],
  },
  {
    domain: 'Abrechnung & Zahlungen',
    modules: [
      { key: 'billing', label: 'Abrechnung', critical: true },
      { key: 'payments', label: 'Zahlungen', critical: true },
      { key: 'payments-refund', label: 'Erstattungen', critical: true },
      { key: 'payments-disputes', label: 'Zahlungsstreitigkeiten', critical: true },
      { key: 'payments-connect', label: 'Stripe Connect', critical: true },
      { key: 'payments-settings', label: 'Zahlungseinstellungen', critical: true },
      { key: 'invoices', label: 'Rechnungen', critical: false },
      { key: 'fines', label: 'Bußgelder', critical: false },
      { key: 'price-tariffs', label: 'Preise & Tarife', critical: false },
    ],
  },
  {
    domain: 'Buchungen & Vermietung',
    modules: [
      { key: 'bookings', label: 'Buchungen', critical: false },
      { key: 'rental-rules', label: 'Mietregeln', critical: true },
      { key: 'rental-rules-publish', label: 'Regeln veröffentlichen', critical: true },
      { key: 'rental-rules-assign', label: 'Regeln zuweisen', critical: true },
      { key: 'rental-rules-overrides', label: 'Regel-Overrides', critical: true },
      { key: 'booking-eligibility', label: 'Buchungsberechtigung', critical: true },
      { key: 'booking-eligibility-override', label: 'Berechtigungs-Override', critical: true },
    ],
  },
  {
    domain: 'Betrieb & Aufgaben',
    modules: [
      { key: 'tasks', label: 'Aufgaben', critical: false },
      { key: 'support', label: 'Support', critical: false },
      { key: 'stations', label: 'Stationen', critical: false },
      { key: 'vendor-management', label: 'Lieferanten', critical: false },
    ],
  },
  {
    domain: 'Dokumente & Compliance',
    modules: [
      { key: 'document-upload', label: 'Dokument-Upload', critical: false },
      { key: 'legal-documents', label: 'Rechtsdokumente', critical: true },
      { key: 'legal-documents-audit', label: 'Rechtsdokument-Audit', critical: true },
    ],
  },
  {
    domain: 'Daten & Auswertung',
    modules: [
      { key: 'data-analyse', label: 'Datenanalyse', critical: false },
      { key: 'data-authorization', label: 'Datenfreigaben', critical: true },
      { key: 'evaluations', label: 'Auswertungen', critical: false },
    ],
  },
  {
    domain: 'Automatisierung & KI',
    modules: [
      { key: 'workflow-automation', label: 'Workflow-Automatisierung', critical: true },
      { key: 'workflow-emergency-override', label: 'Notfall-Override', critical: true },
      { key: 'ai-assistant', label: 'KI-Assistent', critical: false },
    ],
  },
  {
    domain: 'Kunden & Dashboard',
    modules: [
      { key: 'customers', label: 'Kunden', critical: false },
      { key: 'dashboard', label: 'Dashboard', critical: false },
    ],
  },
];

const KNOWN_KEYS = new Set<string>(PERMISSION_MODULE_KEYS);

export function buildPermissionGroups(
  permissions: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null,
): Array<{
  domain: string;
  capabilities: Array<{ key: string; label: string; level: 'read' | 'write' | 'manage'; critical: boolean }>;
}> {
  if (!permissions) return [];

  const groups: Array<{
    domain: string;
    capabilities: Array<{ key: string; label: string; level: 'read' | 'write' | 'manage'; critical: boolean }>;
  }> = [];

  for (const group of PERMISSION_DOMAIN_GROUPS) {
    const capabilities: Array<{
      key: string;
      label: string;
      level: 'read' | 'write' | 'manage';
      critical: boolean;
    }> = [];

    for (const mod of group.modules) {
      if (!KNOWN_KEYS.has(mod.key)) continue;
      const entry = permissions[mod.key];
      if (!entry) continue;
      const level = entry.manage ? 'manage' : entry.write ? 'write' : entry.read ? 'read' : null;
      if (!level) continue;
      capabilities.push({
        key: mod.key,
        label: mod.label,
        level,
        critical: mod.critical,
      });
    }

    if (capabilities.length > 0) {
      groups.push({ domain: group.domain, capabilities });
    }
  }

  return groups;
}

export function extractCriticalCapabilities(
  permissions: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null,
): string[] {
  const caps: string[] = [];
  for (const group of buildPermissionGroups(permissions)) {
    for (const cap of group.capabilities) {
      if (cap.critical) {
        caps.push(`${group.domain}: ${cap.label} (${cap.level})`);
      }
    }
  }
  return caps.slice(0, 8);
}
