// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { EvaluationsActionCenter } from './EvaluationsActionCenter';

const sampleRow = {
  id: 'rec-1',
  organizationId: 'org-1',
  sourceType: 'DASHBOARD_INSIGHT' as const,
  sourceId: 'insight-1',
  category: 'MAINTENANCE' as const,
  title: 'Bremsen prüfen',
  description: 'Erhöhter Verschleiß erkannt',
  rationale: 'Telemetrie zeigt beschleunigten Belagverschleiß.',
  expectedBenefit: { amountMinor: 25000, currency: 'EUR' },
  estimatedCost: { amountMinor: 8000, currency: 'EUR' },
  expectedNetBenefit: { amountMinor: 17000, currency: 'EUR' },
  confidence: 'HIGH' as const,
  priority: 60,
  affectedEntities: [{ entityType: 'vehicle', entityId: 'veh-1', label: 'B-AB 123' }],
  ownerId: null,
  dueAt: null,
  status: 'NEW' as const,
  createdAt: '2026-07-24T10:00:00.000Z',
  updatedAt: '2026-07-24T10:00:00.000Z',
  calculationVersion: 'recommendation-v1',
};

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: TranslationKey) => de[key] ?? key,
  }),
}));

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: 'org-1',
    userRole: 'ORG_ADMIN',
    hasPermission: () => true,
  }),
}));

vi.mock('../../hooks/useEvaluationsRecommendations', () => ({
  useEvaluationsRecommendations: () => ({
    items: [sampleRow],
    loading: false,
    error: null,
    filters: {},
    setFilters: vi.fn(),
    reload: vi.fn(),
    selected: null,
    setSelectedId: vi.fn(),
    events: [],
    eventsLoading: false,
    pendingId: null,
    transitionStatus: vi.fn(),
    updateRecommendation: vi.fn(),
  }),
}));

describe('EvaluationsActionCenter UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders filter fieldset and recommendation list', () => {
    const html = renderToStaticMarkup(<EvaluationsActionCenter isDarkMode={false} />);
    expect(html).toContain('data-testid="evaluations-action-center"');
    expect(html).toContain('<fieldset');
    expect(html).toContain('Bremsen prüfen');
    expect(html).toContain('Maßnahmen-Center');
  });

  it('shows read-only hint for users without manage permission', async () => {
    const rental = await import('../../RentalContext');
    vi.spyOn(rental, 'useRentalOrg').mockReturnValue({
      orgId: 'org-1',
      userRole: 'ORG_USER',
      hasPermission: () => false,
    } as ReturnType<typeof rental.useRentalOrg>);

    const html = renderToStaticMarkup(<EvaluationsActionCenter isDarkMode={false} />);
    expect(html).toContain('Sie können Empfehlungen einsehen');
    expect(html).not.toContain('Als geprüft markieren');
  });
});
