import type { LegalDocumentDto, TenantOrganizationProfileDto, VoiceAssistantData } from '../../../lib/api';
import type { OrganizationRentalRulesDto, RentalRulesOverviewDto } from '../settings/rental-rules/rental-rules.types';
import type { Station } from '../../../lib/api';
import type {
  VoiceKnowledgeCenterSnapshot,
  VoiceKnowledgeOrigin,
  VoiceKnowledgeSourceId,
  VoiceKnowledgeSourceSnapshot,
  VoiceKnowledgeSourceStatus,
} from './voice-knowledge-center.types';

export const VOICE_KNOWLEDGE_SOURCE_ORDER: VoiceKnowledgeSourceId[] = [
  'organization_profile',
  'stations',
  'opening_hours',
  'faq',
  'rental_rules',
  'requirements',
  'terms',
  'pickup',
  'return',
  'deposit',
  'payment_methods',
  'emergency',
  'approved_documents',
];

export const VOICE_KNOWLEDGE_STALE_MS = 90 * 24 * 60 * 60 * 1000;
export const VOICE_KNOWLEDGE_LEGAL_MAX_BYTES = 2 * 1024 * 1024;

const SOURCE_META: Record<
  VoiceKnowledgeSourceId,
  { labelKey: string; dataSourceKey: string; origin: VoiceKnowledgeOrigin }
> = {
  organization_profile: {
    labelKey: 'voice.knowledge.source.organization',
    dataSourceKey: 'voice.knowledge.dataSource.organizationProfile',
    origin: 'static',
  },
  stations: {
    labelKey: 'voice.knowledge.source.stations',
    dataSourceKey: 'voice.knowledge.dataSource.stationsApi',
    origin: 'live',
  },
  opening_hours: {
    labelKey: 'voice.knowledge.source.hours',
    dataSourceKey: 'voice.knowledge.dataSource.assistantConfig',
    origin: 'static',
  },
  faq: {
    labelKey: 'voice.knowledge.source.faq',
    dataSourceKey: 'voice.knowledge.dataSource.assistantSnippets',
    origin: 'static',
  },
  rental_rules: {
    labelKey: 'voice.knowledge.source.rentalRules',
    dataSourceKey: 'voice.knowledge.dataSource.rentalRulesApi',
    origin: 'static',
  },
  requirements: {
    labelKey: 'voice.knowledge.source.requirements',
    dataSourceKey: 'voice.knowledge.dataSource.rentalRulesApi',
    origin: 'static',
  },
  terms: {
    labelKey: 'voice.knowledge.source.terms',
    dataSourceKey: 'voice.knowledge.dataSource.legalDocuments',
    origin: 'static',
  },
  pickup: {
    labelKey: 'voice.knowledge.source.pickup',
    dataSourceKey: 'voice.knowledge.dataSource.rentalRulesApi',
    origin: 'static',
  },
  return: {
    labelKey: 'voice.knowledge.source.return',
    dataSourceKey: 'voice.knowledge.dataSource.rentalRulesApi',
    origin: 'static',
  },
  deposit: {
    labelKey: 'voice.knowledge.source.deposit',
    dataSourceKey: 'voice.knowledge.dataSource.rentalRulesApi',
    origin: 'static',
  },
  payment_methods: {
    labelKey: 'voice.knowledge.source.payment',
    dataSourceKey: 'voice.knowledge.dataSource.rentalRulesApi',
    origin: 'static',
  },
  emergency: {
    labelKey: 'voice.knowledge.source.emergency',
    dataSourceKey: 'voice.knowledge.dataSource.assistantConfig',
    origin: 'static',
  },
  approved_documents: {
    labelKey: 'voice.knowledge.source.documents',
    dataSourceKey: 'voice.knowledge.dataSource.legalDocuments',
    origin: 'static',
  },
};

export function sanitizeKnowledgeDisplayText(text: string, maxLen = 160): string {
  return text
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function isStale(isoDate: string | null | undefined, now = Date.now()): boolean {
  if (!isoDate) return false;
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return false;
  return now - ts > VOICE_KNOWLEDGE_STALE_MS;
}

function snapshot(
  id: VoiceKnowledgeSourceId,
  status: VoiceKnowledgeSourceStatus,
  detail: string,
  opts?: {
    lastUpdatedAt?: string | null;
    published?: boolean;
    previewDocumentId?: string;
    previewAllowed?: boolean;
    errorMessage?: string;
  },
): VoiceKnowledgeSourceSnapshot {
  const meta = SOURCE_META[id];
  return {
    id,
    status,
    origin: meta.origin,
    labelKey: meta.labelKey,
    dataSourceKey: meta.dataSourceKey,
    lastUpdatedAt: opts?.lastUpdatedAt ?? null,
    published: opts?.published ?? status === 'CONNECTED',
    detail: sanitizeKnowledgeDisplayText(detail),
    previewDocumentId: opts?.previewDocumentId,
    previewAllowed: opts?.previewAllowed,
    errorMessage: opts?.errorMessage ? sanitizeKnowledgeDisplayText(opts.errorMessage, 200) : undefined,
  };
}

function activeLegalDoc(
  docs: LegalDocumentDto[],
  documentType: string,
): LegalDocumentDto | undefined {
  return docs.find(d => d.documentType === documentType && d.status === 'ACTIVE');
}

export function buildOrganizationProfileSource(
  profile: TenantOrganizationProfileDto | null,
  error?: string,
): VoiceKnowledgeSourceSnapshot {
  if (error) {
    return snapshot('organization_profile', 'ERROR', error, { errorMessage: error });
  }
  if (!profile) {
    return snapshot('organization_profile', 'NOT_PUBLISHED', 'Organization profile not loaded.');
  }
  const complete = Boolean(
    profile.companyName?.trim() &&
      profile.address?.trim() &&
      profile.city?.trim() &&
      profile.phone?.trim(),
  );
  const status: VoiceKnowledgeSourceStatus = complete ? 'CONNECTED' : 'INCOMPLETE';
  return snapshot(
    'organization_profile',
    isStale((profile as { updatedAt?: string }).updatedAt) && complete ? 'STALE' : status,
    complete
      ? `${profile.companyName} · ${profile.city ?? '—'}`
      : 'Company name, address, or contact details missing.',
    { lastUpdatedAt: (profile as { updatedAt?: string }).updatedAt ?? null, published: complete },
  );
}

export function buildStationsSource(stations: Station[] | null, error?: string): VoiceKnowledgeSourceSnapshot {
  if (error) return snapshot('stations', 'ERROR', error, { errorMessage: error });
  const count = stations?.length ?? 0;
  return snapshot(
    'stations',
    count > 0 ? 'CONNECTED' : 'INCOMPLETE',
    count > 0 ? `${count} active location(s) in fleet data.` : 'No rental locations configured yet.',
    { published: count > 0 },
  );
}

export function buildOpeningHoursSource(assistant: VoiceAssistantData | null): VoiceKnowledgeSourceSnapshot {
  const hasHours = Boolean(assistant?.businessHoursStart?.trim() && assistant?.businessHoursEnd?.trim());
  return snapshot(
    'opening_hours',
    hasHours ? 'CONNECTED' : 'INCOMPLETE',
    hasHours
      ? `${assistant!.businessHoursStart}–${assistant!.businessHoursEnd} (${assistant?.businessHoursTimezone ?? 'timezone pending'})`
      : 'Business hours not configured in availability settings.',
    { published: hasHours },
  );
}

export function buildFaqSource(assistant: VoiceAssistantData | null): VoiceKnowledgeSourceSnapshot {
  const text = assistant?.knowledgeSnippets?.trim() ?? '';
  const hasFaq = text.length >= 40;
  return snapshot(
    'faq',
    hasFaq ? 'CONNECTED' : 'INCOMPLETE',
    hasFaq ? 'FAQ snippets configured for the assistant.' : 'Add FAQ blocks in assistant settings or knowledge step.',
    { published: hasFaq },
  );
}

export function buildRentalRulesSource(
  overview: RentalRulesOverviewDto | null,
  error?: string,
): VoiceKnowledgeSourceSnapshot {
  if (error) return snapshot('rental_rules', 'ERROR', error, { errorMessage: error });
  const ok = Boolean(overview?.defaultsConfigured || (overview?.activeCategoryCount ?? 0) > 0);
  return snapshot(
    'rental_rules',
    ok ? 'CONNECTED' : 'INCOMPLETE',
    ok
      ? `Defaults ${overview?.defaultsConfigured ? 'set' : 'partial'} · ${overview?.activeCategoryCount ?? 0} categories`
      : 'Rental rules defaults not configured.',
    { published: ok },
  );
}

export function buildRequirementsSource(
  defaults: OrganizationRentalRulesDto | null,
  overview: RentalRulesOverviewDto | null,
  error?: string,
): VoiceKnowledgeSourceSnapshot {
  if (error) return snapshot('requirements', 'ERROR', error, { errorMessage: error });
  const hasAge = defaults?.minimumAgeYears != null;
  const hasLicense = defaults?.minimumLicenseHoldingMonths != null || defaults?.minimumLicenseHoldingYears != null;
  const ok = Boolean(overview?.defaultsConfigured && hasAge && hasLicense);
  return snapshot(
    'requirements',
    ok ? 'CONNECTED' : overview?.defaultsConfigured ? 'INCOMPLETE' : 'NOT_PUBLISHED',
    ok
      ? `Min. age ${defaults!.minimumAgeYears} · license holding configured`
      : 'Driver age and license requirements incomplete.',
    {
      lastUpdatedAt: defaults?.updatedAt ?? null,
      published: ok,
    },
  );
}

export function buildTermsSource(docs: LegalDocumentDto[], error?: string): VoiceKnowledgeSourceSnapshot {
  if (error) return snapshot('terms', 'ERROR', error, { errorMessage: error });
  const terms = activeLegalDoc(docs, 'TERMS_AND_CONDITIONS');
  if (!terms) {
    return snapshot('terms', 'NOT_PUBLISHED', 'No active terms & conditions document.');
  }
  const oversized = (terms.sizeBytes ?? 0) > VOICE_KNOWLEDGE_LEGAL_MAX_BYTES;
  return snapshot(
    'terms',
    oversized ? 'INCOMPLETE' : 'CONNECTED',
    `${terms.title} (${terms.versionLabel})`,
    {
      lastUpdatedAt: terms.activeFrom ?? terms.createdAt,
      published: true,
      previewDocumentId: terms.id,
      previewAllowed: !oversized,
    },
  );
}

export function buildPickupReturnSource(
  id: 'pickup' | 'return',
  defaults: OrganizationRentalRulesDto | null,
): VoiceKnowledgeSourceSnapshot {
  const configured = Boolean(defaults?.configured && defaults.notes?.trim());
  return snapshot(
    id,
    configured ? 'CONNECTED' : defaults?.configured ? 'INCOMPLETE' : 'NOT_PUBLISHED',
    configured
      ? 'Handover policies referenced from rental defaults.'
      : 'Pickup/return guidance not documented in rental rules.',
    { lastUpdatedAt: defaults?.updatedAt ?? null, published: configured },
  );
}

export function buildDepositSource(defaults: OrganizationRentalRulesDto | null): VoiceKnowledgeSourceSnapshot {
  const hasDeposit = defaults?.depositAmountCents != null || defaults?.depositAmount != null;
  return snapshot(
    'deposit',
    hasDeposit ? 'CONNECTED' : defaults?.configured ? 'INCOMPLETE' : 'NOT_PUBLISHED',
    hasDeposit ? 'Deposit amount configured in rental defaults.' : 'Deposit policy not set.',
    { lastUpdatedAt: defaults?.updatedAt ?? null, published: hasDeposit },
  );
}

export function buildPaymentMethodsSource(defaults: OrganizationRentalRulesDto | null): VoiceKnowledgeSourceSnapshot {
  const known = defaults?.creditCardRequired != null;
  return snapshot(
    'payment_methods',
    known ? 'CONNECTED' : defaults?.configured ? 'INCOMPLETE' : 'NOT_PUBLISHED',
    known
      ? defaults!.creditCardRequired
        ? 'Credit card required for rentals.'
        : 'Credit card not mandatory per rental defaults.'
      : 'Payment method policy not defined.',
    { lastUpdatedAt: defaults?.updatedAt ?? null, published: known },
  );
}

export function buildEmergencySource(assistant: VoiceAssistantData | null): VoiceKnowledgeSourceSnapshot {
  const hasEscalation = Boolean(
    assistant?.escalationPhone?.trim() ||
      assistant?.escalateOnRequest ||
      assistant?.escalateOnSensitive,
  );
  return snapshot(
    'emergency',
    hasEscalation ? 'CONNECTED' : 'INCOMPLETE',
    hasEscalation
      ? 'Escalation phone or triggers configured.'
      : 'Emergency escalation path not configured.',
    { published: hasEscalation },
  );
}

export function buildApprovedDocumentsSource(docs: LegalDocumentDto[], error?: string): VoiceKnowledgeSourceSnapshot {
  if (error) return snapshot('approved_documents', 'ERROR', error, { errorMessage: error });
  const active = docs.filter(d => d.status === 'ACTIVE');
  if (active.length === 0) {
    return snapshot('approved_documents', 'NOT_PUBLISHED', 'No approved legal documents published.');
  }
  return snapshot(
    'approved_documents',
    'CONNECTED',
    `${active.length} approved document version(s) available.`,
    {
      lastUpdatedAt: active[0]?.activeFrom ?? active[0]?.createdAt ?? null,
      published: true,
      previewAllowed: active.every(d => (d.sizeBytes ?? 0) <= VOICE_KNOWLEDGE_LEGAL_MAX_BYTES),
    },
  );
}

export function assembleKnowledgeCenter(sources: VoiceKnowledgeSourceSnapshot[]): VoiceKnowledgeCenterSnapshot {
  const gaps = sources
    .filter(s => s.status !== 'CONNECTED')
    .map(s => s.id);
  const connectedCount = sources.filter(s => s.status === 'CONNECTED').length;
  const freshness =
    connectedCount >= 10 ? 'good' : connectedCount >= 6 ? 'partial' : 'needs_attention';
  return { sources, gaps, connectedCount, freshness };
}

export function knowledgeStatusTone(
  status: VoiceKnowledgeSourceStatus,
): 'success' | 'watch' | 'critical' | 'neutral' | 'info' {
  switch (status) {
    case 'CONNECTED':
      return 'success';
    case 'INCOMPLETE':
      return 'watch';
    case 'STALE':
      return 'info';
    case 'NOT_PUBLISHED':
      return 'neutral';
    case 'ERROR':
      return 'critical';
    default:
      return 'neutral';
  }
}
