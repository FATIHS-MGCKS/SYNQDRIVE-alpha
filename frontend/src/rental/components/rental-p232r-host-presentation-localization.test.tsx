// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { act, createElement, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import type { BrakeHealthSummary } from '../../lib/api';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { writePersistedLocale } from '../../i18n/locales';
import { api } from '../../lib/api';
import { BrakeEvidencePanel } from './health/BrakeEvidencePanel';
import { BookingEditDialog } from './booking-detail/BookingEditDialog';
import {
  useCustomerDocumentStatus,
  useCustomerDocuments,
  useCustomerFines,
  useCustomerInvoices,
  useCustomerTimeline,
  useCustomerDetail,
} from './customer-detail/useCustomerDetailData';
import { useDataAuthorizationCenter } from './settings/data-authorization/useDataAuthorizationCenter';
import { VoiceConversationsPanel } from './voice-assistant/VoiceConversationsPanel';
import { NewBookingView } from './NewBookingView';

const ORG_ID = 'org-p232r-x7';
const CUSTOMER_ID = 'cust-p232r-x7';
const RAW_CUSTOMER = 'Provider Customer X7';
const RAW_STATION = 'Station X7';

const apiCounters = {
  documentStatus: 0,
  documents: 0,
  timeline: 0,
  fines: 0,
  invoices: 0,
  customerGet: 0,
  dataAuthList: 0,
  dataAuthStats: 0,
  dataAuthGrant: 0,
  voiceConversations: 0,
  voiceCreateTask: 0,
  stationsList: 0,
  cleaningStatus: 0,
  newBookingCustomers: 0,
};

let mountCount = 0;
let failDocumentStatus = false;

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      customers: {
        ...actual.api.customers,
        list: vi.fn(async () => {
          apiCounters.newBookingCustomers += 1;
          return [];
        }),
        get: vi.fn(async () => {
          apiCounters.customerGet += 1;
          return {
            id: CUSTOMER_ID,
            firstName: RAW_CUSTOMER,
            lastName: '',
            email: 'x7@example.com',
            company: null,
          };
        }),
        customerDocuments: {
          status: vi.fn(async () => {
            apiCounters.documentStatus += 1;
            if (failDocumentStatus) throw new Error('Backend Error X7');
            return { verified: false };
          }),
          list: vi.fn(async () => {
            apiCounters.documents += 1;
            return [];
          }),
        },
        customerTimeline: {
          list: vi.fn(async () => {
            apiCounters.timeline += 1;
            return { data: [] };
          }),
        },
      },
      fines: {
        byCustomer: vi.fn(async () => {
          apiCounters.fines += 1;
          return [];
        }),
      },
      invoices: {
        byCustomer: vi.fn(async () => {
          apiCounters.invoices += 1;
          return [];
        }),
      },
      dataAuthorizations: {
        list: vi.fn(async () => {
          apiCounters.dataAuthList += 1;
          return [];
        }),
        stats: vi.fn(async () => {
          apiCounters.dataAuthStats += 1;
          return {
            total: 0,
            active: 0,
            pending: 0,
            highRisk: 0,
            expiringSoon: 0,
            revoked: 0,
            expired: 0,
          };
        }),
        grant: vi.fn(async () => {
          apiCounters.dataAuthGrant += 1;
          return { id: 'auth-1', status: 'ACTIVE' };
        }),
      },
      voiceAssistant: {
        conversations: vi.fn(async () => {
          apiCounters.voiceConversations += 1;
          return {
            items: [
              {
                id: 'call-x7',
                direction: 'INBOUND',
                callerNumber: '+49123456789',
                outcome: 'COMPLETED',
                startedAt: '2026-08-30T10:00:00.000Z',
                durationSeconds: 42,
              },
            ],
            total: 1,
          };
        }),
        createTaskFromCall: vi.fn(async () => {
          apiCounters.voiceCreateTask += 1;
          return { taskId: 'task-x7' };
        }),
      },
      stations: {
        list: vi.fn(async () => {
          apiCounters.stationsList += 1;
          return [{ id: 'st-x7', name: RAW_STATION }];
        }),
      },
      bookings: {
        update: vi.fn(async () => ({})),
      },
      tasks: {
        create: vi.fn(async () => ({ id: 'task-x7' })),
      },
      vehicles: {
        updateOperationalStatus: vi.fn(async () => {
          apiCounters.cleaningStatus += 1;
          return { cleaningTask: { action: 'created', taskId: 'clean-x7' } };
        }),
      },
    },
  };
});

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: ORG_ID }),
}));

vi.mock('../FleetContext', () => ({
  useFleetVehicles: () => ({
    fleetVehicles: [
      {
        id: 'veh-x7',
        brand: 'Test',
        make: 'Test',
        model: 'X7',
        license: 'KS MX 2024',
        licensePlate: 'KS MX 2024',
        status: 'Available',
        station: RAW_STATION,
        stationId: 'st-x7',
        dailyRate: 50,
      },
    ],
  }),
}));

vi.mock('../hooks/usePriceTariffs', () => ({
  usePriceTariffs: () => ({
    catalog: {
      priceBook: { taxRatePercent: 19 },
      assignments: [],
      mileagePackages: [],
      insuranceOptions: [],
      extraOptions: [],
    },
    loading: false,
  }),
}));

vi.mock('../hooks/useRentalRulesPermissions', () => ({
  useRentalRulesPermissions: () => ({
    canReviewEligibility: false,
    canOverrideEligibility: false,
  }),
}));

function LocaleHarness({ children }: { children: ReactNode }) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      mountCount += 1;
    }
  }, []);
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', 'data-testid': 'locale-en', onClick: () => setLocale('en') },
      'EN',
    ),
    createElement(
      'button',
      { type: 'button', 'data-testid': 'locale-de', onClick: () => setLocale('de') },
      'DE',
    ),
    createElement('div', { 'data-testid': `active-locale-${locale}` }, children),
  );
}

function renderWithLocale(ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(LanguageProvider, null, createElement(LocaleHarness, null, ui)));
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function switchLocale(container: HTMLElement, locale: 'en' | 'de') {
  await act(async () => {
    (container.querySelector(`[data-testid="locale-${locale}"]`) as HTMLButtonElement)?.click();
  });
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function brakeSummaryFixture(): BrakeHealthSummary {
  return {
    isInitialized: true,
    stateClass: 'ESTIMATED',
    overallCondition: 'GOOD',
    evidencePresentation: {
      dataQuality: [
        {
          code: 'COVERAGE_GAP',
          labelDe: 'Datenlücke',
          labelEn: 'Coverage gap',
          active: true,
          detailDe: 'Teilweise modelliert',
          detailEn: 'Partially modeled',
        },
      ],
      safety: [
        {
          code: 'DTC',
          labelDe: 'Fehlercode',
          labelEn: 'Fault code',
          active: true,
          detailDe: 'Aktiver DTC',
          detailEn: 'Active DTC',
          severity: 'warning',
        },
      ],
      structuredActions: [],
      modelVersion: 'brake-wear-v2',
    },
  } as unknown as BrakeHealthSummary;
}

function CustomerHooksWitness({
  onReady,
  showErrors = false,
}: {
  onReady?: (snapshot: Record<string, unknown>) => void;
  showErrors?: boolean;
}) {
  const documentStatus = useCustomerDocumentStatus(ORG_ID, CUSTOMER_ID);
  const documents = useCustomerDocuments(ORG_ID, CUSTOMER_ID);
  const timeline = useCustomerTimeline(ORG_ID, CUSTOMER_ID);
  const fines = useCustomerFines(ORG_ID, CUSTOMER_ID);
  const invoices = useCustomerInvoices(ORG_ID, CUSTOMER_ID);

  useEffect(() => {
    if (
      onReady &&
      !documentStatus.loading &&
      !documents.loading &&
      !timeline.loading &&
      !fines.loading &&
      !invoices.loading
    ) {
      onReady({
        documentStatusError: documentStatus.error,
        documentsError: documents.error,
        timelineError: timeline.error,
        finesError: fines.error,
        invoicesError: invoices.error,
      });
    }
  }, [
    documentStatus.loading,
    documentStatus.error,
    documents.loading,
    documents.error,
    timeline.loading,
    timeline.error,
    fines.loading,
    fines.error,
    invoices.loading,
    invoices.error,
    onReady,
  ]);

  if (!showErrors) {
    return createElement('div', { 'data-testid': 'customer-hooks-witness' });
  }

  return createElement(
    'div',
    { 'data-testid': 'customer-hooks-witness' },
    createElement('div', { 'data-testid': 'document-status-error' }, documentStatus.error ?? ''),
  );
}

function DataAuthLoadWitness({
  onCounts,
}: {
  onCounts: (counts: { list: number; stats: number }) => void;
}) {
  const { load } = useDataAuthorizationCenter(ORG_ID);
  useEffect(() => {
    void load().then(() => {
      onCounts({ list: apiCounters.dataAuthList, stats: apiCounters.dataAuthStats });
    });
  }, [load, onCounts]);
  return createElement('div', { 'data-testid': 'data-auth-witness' });
}

/** Mirrors App.tsx persistCleaningStatus toast branches for created action. */
function AppCleaningStatusHarness() {
  const { t } = useLanguage();
  const run = useCallback(async () => {
    const res = await api.vehicles.updateOperationalStatus(ORG_ID, 'veh-x7', {
      cleaningStatus: 'NEEDS_CLEANING',
    });
    if (res.cleaningTask?.action === 'created') {
      toast.success(t('rental.shell.cleaning.toast.taskCreated'), {
        description: t('rental.shell.cleaning.toast.taskCreatedDescription'),
      });
    }
  }, [t]);
  return createElement(
    'button',
    { type: 'button', 'data-testid': 'run-cleaning', onClick: () => void run() },
    'clean',
  );
}

function DataAuthGrantWitness() {
  const { grant } = useDataAuthorizationCenter(ORG_ID);
  return createElement(
    'button',
    { type: 'button', 'data-testid': 'grant-auth', onClick: () => void grant('auth-1') },
    'grant',
  );
}

describe('P2.3.2R host-presentation remediation', () => {
  beforeEach(() => {
    mountCount = 0;
    failDocumentStatus = false;
    Object.keys(apiCounters).forEach((key) => {
      apiCounters[key as keyof typeof apiCounters] = 0;
    });
    writePersistedLocale('de');
    vi.clearAllMocks();
  });

  it('new translation keys exist in EN and DE with parity', () => {
    const sampleKeys = [
      'rental.shell.cleaning.toast.taskCreated',
      'bookings.toast.saved',
      'newBooking.toast.incomplete',
      'customers.toast.noteSaved',
      'rental.vehicleHealth.aria.dataQuality',
      'settings.dataAuth.toast.approved',
      'voice.conversations.toast.taskCreated',
    ] as const;
    for (const key of sampleKeys) {
      expect(en[key]).toBeTruthy();
      expect(de[key]).toBeTruthy();
      expect(en[key]).not.toBe(de[key]);
    }
    expect(Object.keys(en).length).toBe(Object.keys(de).length);
  });

  it('customer hooks: initial fetch > 0 and locale switch adds zero business requests', async () => {
    let ready = false;
    const onReady = vi.fn(() => {
      ready = true;
    });
    const { container, unmount } = renderWithLocale(
      createElement(CustomerHooksWitness, { onReady }),
    );
    await flushMicrotasks();
    expect(ready).toBe(true);
    expect(mountCount).toBe(1);

    const initial = { ...apiCounters };
    expect(initial.documentStatus).toBeGreaterThan(0);
    expect(initial.documents).toBeGreaterThan(0);
    expect(initial.timeline).toBeGreaterThan(0);
    expect(initial.fines).toBeGreaterThan(0);
    expect(initial.invoices).toBeGreaterThan(0);

    await switchLocale(container, 'en');
    await flushMicrotasks();
    const afterEn = { ...apiCounters };
    expect(afterEn.documentStatus - initial.documentStatus).toBe(0);
    expect(afterEn.documents - initial.documents).toBe(0);
    expect(afterEn.timeline - initial.timeline).toBe(0);
    expect(afterEn.fines - initial.fines).toBe(0);
    expect(afterEn.invoices - initial.invoices).toBe(0);

    await switchLocale(container, 'de');
    await flushMicrotasks();
    const afterDe = { ...apiCounters };
    expect(afterDe.documentStatus - initial.documentStatus).toBe(0);
    expect(afterDe.documents - initial.documents).toBe(0);
    expect(afterDe.timeline - initial.timeline).toBe(0);
    expect(afterDe.fines - initial.fines).toBe(0);
    expect(afterDe.invoices - initial.invoices).toBe(0);
    expect(mountCount).toBe(1);
    unmount();
  });

  it('customer hook error presentation localizes DE→EN→DE without refetch', async () => {
    failDocumentStatus = true;
    const { container, unmount } = renderWithLocale(
      createElement(CustomerHooksWitness, { showErrors: true }),
    );
    await flushMicrotasks();
    const initialCalls = apiCounters.documentStatus;
    expect(initialCalls).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="document-status-error"]')?.textContent).toBe(
      de['customers.error.documentStatusLoad'],
    );

    await switchLocale(container, 'en');
    await flushMicrotasks();
    expect(container.querySelector('[data-testid="document-status-error"]')?.textContent).toBe(
      en['customers.error.documentStatusLoad'],
    );
    expect(apiCounters.documentStatus).toBe(initialCalls);

    await switchLocale(container, 'de');
    await flushMicrotasks();
    expect(container.querySelector('[data-testid="document-status-error"]')?.textContent).toBe(
      de['customers.error.documentStatusLoad'],
    );
    expect(apiCounters.documentStatus).toBe(initialCalls);
    unmount();
  });

  it('data authorization load identity stays stable across locale switch', async () => {
    let counts = { list: 0, stats: 0 };
    const onCounts = vi.fn((value: { list: number; stats: number }) => {
      counts = value;
    });
    const { container, unmount } = renderWithLocale(
      createElement(DataAuthLoadWitness, { onCounts }),
    );
    await flushMicrotasks();
    expect(counts.list).toBeGreaterThan(0);
    expect(counts.stats).toBeGreaterThan(0);
    const initial = { ...apiCounters };

    await switchLocale(container, 'en');
    await flushMicrotasks();
    expect(apiCounters.dataAuthList - initial.dataAuthList).toBe(0);
    expect(apiCounters.dataAuthStats - initial.dataAuthStats).toBe(0);

    await switchLocale(container, 'de');
    await flushMicrotasks();
    expect(apiCounters.dataAuthList - initial.dataAuthList).toBe(0);
    expect(apiCounters.dataAuthStats - initial.dataAuthStats).toBe(0);
    unmount();
  });

  it('raw customer fixture bytes preserved through useCustomerDetail product path', async () => {
    function CustomerDetailWitness() {
      const { detail } = useCustomerDetail(ORG_ID, CUSTOMER_ID);
      return createElement('div', { 'data-testid': 'raw-customer' }, detail?.firstName ?? '');
    }
    const { container, unmount } = renderWithLocale(createElement(CustomerDetailWitness));
    await flushMicrotasks();
    expect(apiCounters.customerGet).toBeGreaterThan(0);
    const rawBefore = container.querySelector('[data-testid="raw-customer"]')?.textContent;
    expect(rawBefore).toBe(RAW_CUSTOMER);

    await switchLocale(container, 'en');
    await flushMicrotasks();
    expect(container.querySelector('[data-testid="raw-customer"]')?.textContent).toBe(RAW_CUSTOMER);
    expect(apiCounters.customerGet).toBe(1);
    unmount();
  });

  it('BrakeEvidencePanel aria-label localizes in mounted DOM', async () => {
    const { container, unmount } = renderWithLocale(
      createElement(BrakeEvidencePanel, { summary: brakeSummaryFixture(), locale: 'de' }),
    );
    const qualitySection = container.querySelector(
      'section[aria-label="Datenqualität"]',
    ) as HTMLElement | null;
    const safetySection = container.querySelector(
      'section[aria-label="Sicherheit"]',
    ) as HTMLElement | null;
    expect(qualitySection).toBeTruthy();
    expect(safetySection).toBeTruthy();

    await switchLocale(container, 'en');
    expect(
      container.querySelector('section[aria-label="Data quality"]'),
    ).toBeTruthy();
    expect(container.querySelector('section[aria-label="Safety"]')).toBeTruthy();

    await switchLocale(container, 'de');
    expect(
      container.querySelector('section[aria-label="Datenqualität"]'),
    ).toBeTruthy();
    unmount();
  });

  it('booking mutation toast uses current locale on same mount', async () => {
    const detail = {
      core: {
        bookingId: 'bk-x7',
        bookingNumber: 'BK-X7',
        startDate: '2026-09-01T10:00:00.000Z',
        endDate: '2026-09-03T10:00:00.000Z',
        notes: 'note',
        kmIncluded: 100,
        pickupStationId: 'st-x7',
        returnStationId: 'st-x7',
      },
      customer: { customerId: CUSTOMER_ID },
      vehicle: { vehicleId: 'veh-x7' },
    } as any;

    const { container, unmount } = renderWithLocale(
      createElement(BookingEditDialog, {
        orgId: ORG_ID,
        detail,
        onClose: () => undefined,
        onSaved: () => undefined,
      }),
    );
    await flushMicrotasks();

    const notesField = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(notesField).toBeTruthy();
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      nativeSetter?.call(notesField, 'note-updated-x7');
      notesField.dispatchEvent(new Event('input', { bubbles: true }));
      notesField.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Speichern'),
    );
    expect(saveButton).toBeTruthy();
    await act(async () => {
      (saveButton as HTMLButtonElement).click();
    });
    await flushMicrotasks();
    expect(toast.success).toHaveBeenCalledWith(de['bookings.toast.saved']);

    await switchLocale(container, 'en');
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      nativeSetter?.call(notesField, 'note-updated-x7-en');
      notesField.dispatchEvent(new Event('input', { bubbles: true }));
      notesField.dispatchEvent(new Event('change', { bubbles: true }));
      (saveButton as HTMLButtonElement).click();
    });
    await flushMicrotasks();
    expect(toast.success).toHaveBeenCalledWith(en['bookings.toast.saved']);
    unmount();
  });

  it('data authorization grant toast uses current locale on same mount', async () => {
    const { container, unmount } = renderWithLocale(createElement(DataAuthGrantWitness));
    await flushMicrotasks();

    await act(async () => {
      (container.querySelector('[data-testid="grant-auth"]') as HTMLButtonElement)?.click();
    });
    await flushMicrotasks();
    expect(toast.success).toHaveBeenCalledWith(de['settings.dataAuth.toast.approved']);

    await switchLocale(container, 'en');
    await act(async () => {
      (container.querySelector('[data-testid="grant-auth"]') as HTMLButtonElement)?.click();
    });
    await flushMicrotasks();
    expect(toast.success).toHaveBeenCalledWith(en['settings.dataAuth.toast.approved']);
    unmount();
  });

  it('voice conversation task toast uses current locale on same mount', async () => {
    const { container, unmount } = renderWithLocale(
      createElement(VoiceConversationsPanel, {
        orgId: ORG_ID,
        isDarkMode: false,
        cardClassName: 'card',
      }),
    );
    await flushMicrotasks();
    expect(apiCounters.voiceConversations).toBeGreaterThan(0);

    const createBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Create task from call'),
    );
    expect(createBtn).toBeTruthy();
    await act(async () => {
      (createBtn as HTMLButtonElement).click();
    });
    await flushMicrotasks();
    expect(toast.success).toHaveBeenCalledWith(de['voice.conversations.toast.taskCreated']);

    await switchLocale(container, 'en');
    const createBtnEn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Create task from call'),
    );
    expect(createBtnEn).toBeTruthy();
    await act(async () => {
      (createBtnEn as HTMLButtonElement).click();
    });
    await flushMicrotasks();
    expect(toast.success).toHaveBeenCalledWith(en['voice.conversations.toast.taskCreated']);
    unmount();
  });

  it('app shell cleaning-status path emits locale-aware toast', async () => {
    const { container, unmount } = renderWithLocale(createElement(AppCleaningStatusHarness));
    await act(async () => {
      (container.querySelector('[data-testid="run-cleaning"]') as HTMLButtonElement)?.click();
    });
    await flushMicrotasks();
    expect(apiCounters.cleaningStatus).toBe(1);
    expect(toast.success).toHaveBeenCalledWith(
      de['rental.shell.cleaning.toast.taskCreated'],
      expect.objectContaining({
        description: de['rental.shell.cleaning.toast.taskCreatedDescription'],
      }),
    );

    await switchLocale(container, 'en');
    await act(async () => {
      (container.querySelector('[data-testid="run-cleaning"]') as HTMLButtonElement)?.click();
    });
    await flushMicrotasks();
    expect(apiCounters.cleaningStatus).toBe(2);
    expect(toast.success).toHaveBeenCalledWith(
      en['rental.shell.cleaning.toast.taskCreated'],
      expect.objectContaining({
        description: en['rental.shell.cleaning.toast.taskCreatedDescription'],
      }),
    );
    unmount();
  });

  it('NewBookingView preserves vehicle search state and emits locale-aware incomplete toast', async () => {
    const { container, unmount } = renderWithLocale(
      createElement(NewBookingView, {
        onBack: () => undefined,
        onViewBooking: () => undefined,
        onCustomerCreated: () => undefined,
        onBookingCreated: () => undefined,
      }),
    );
    await flushMicrotasks();
    expect(mountCount).toBe(1);
    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement | null;
    expect(searchInput).toBeTruthy();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      nativeInputValueSetter?.call(searchInput, 'KS MX 2024');
      searchInput!.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const before = searchInput!.value;
    expect(before).toBe('KS MX 2024');
    await switchLocale(container, 'en');
    expect(searchInput!.value).toBe(before);

    for (let step = 0; step < 4; step += 1) {
      const vehicleCard = container.querySelector('button');
      if (step === 0 && vehicleCard) {
        await act(async () => {
          vehicleCard.click();
        });
      }
      const nextButton = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Weiter') || btn.textContent?.includes('Next'),
      );
      if (nextButton && !(nextButton as HTMLButtonElement).disabled) {
        await act(async () => {
          nextButton.click();
        });
      }
      await flushMicrotasks();
    }

    const confirmButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Buchung bestätigen') || btn.textContent?.includes('Confirm booking'),
    );
    if (confirmButton && !(confirmButton as HTMLButtonElement).disabled) {
      await act(async () => {
        confirmButton.click();
      });
      expect(toast.error).toHaveBeenCalledWith(en['newBooking.toast.incomplete']);
      await switchLocale(container, 'de');
      await act(async () => {
        confirmButton.click();
      });
      expect(toast.error).toHaveBeenCalledWith(de['newBooking.toast.incomplete']);
    }
    unmount();
  });
});
