import type { OrgEmailDomainStatus } from '../../../../lib/api';

/** Platform default sender — mirrors backend `email.config.ts` defaults. */
export const PLATFORM_DEFAULT_FROM_EMAIL = 'noreply@synqdrive.eu';
export const PLATFORM_DEFAULT_FROM_NAME = 'SynqDrive';

export const DOMAIN_STATUS_LABELS: Record<OrgEmailDomainStatus, string> = {
  NOT_CONFIGURED: 'Noch nicht eingerichtet',
  PENDING_DNS: 'DNS-Einträge ausstehend',
  VERIFYING: 'Prüfung läuft',
  VERIFIED: 'Verifiziert',
  FAILED: 'Fehlerhaft',
};

export const DNS_PURPOSE_LABELS: Record<string, string> = {
  SPF: 'SPF',
  DKIM: 'DKIM',
  DMARC: 'DMARC',
  RETURN_PATH: 'Return-Path',
};

export const DNS_PROVIDER_HINTS = [
  {
    id: 'cloudflare',
    title: 'Cloudflare',
    hint: 'DNS-Einträge unter DNS → Records. Bei Proxied-Status für CNAME ggf. „DNS only“ wählen.',
  },
  {
    id: 'hostinger',
    title: 'Hostinger',
    hint: 'hPanel → Domains → DNS / Nameserver → DNS-Einträge verwalten.',
  },
  {
    id: 'ionos',
    title: 'IONOS',
    hint: 'Domains & SSL → Domain → DNS-Einstellungen → Records hinzufügen.',
  },
  {
    id: 'strato',
    title: 'Strato',
    hint: 'Domainverwaltung → DNS-Einstellungen → Eintrag hinzufügen.',
  },
] as const;
