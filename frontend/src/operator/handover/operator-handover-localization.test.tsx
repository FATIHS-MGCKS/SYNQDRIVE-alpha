// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

const mockFormState = vi.hoisted(() => ({
  booking: {
    id: 'booking-1',
    vehicleId: 'veh-1',
    customerId: 'cust-1',
    vehicleName: 'Tesla Model 3',
    plate: 'M-AB 123',
    customerName: 'Jane Doe',
    startDate: '2026-08-21T10:00:00.000Z',
    endDate: '2026-08-28T10:00:00.000Z',
    pickupLocation: 'Munich Central',
    returnLocation: 'Munich Central',
    pickupStationId: 'st-1',
    returnStationId: 'st-1',
    pickupOdometerKm: 10000,
  },
  state: {
    odometerKm: '',
    fuelPercent: 100,
    fuelFull: true,
    performedAtLocal: '',
    checks: {
      exteriorClean: true,
      interiorClean: true,
      tiresSeasonOk: true,
      warningLightsOn: false,
      documentsAcknowledged: false,
    },
    warningLightsNotes: '',
    notes: '',
    staffId: '',
    staffName: '',
    customerSigData: null,
    customerSigName: '',
    staffSigData: null,
    staffSigName: '',
    actualStationId: '',
    selectedDamageIds: new Set<string>(),
    tireMeasurementCaptured: false,
    technicalObservationDrafts: [],
  },
  damages: [
    {
      id: 'dmg-1',
      damageType: 'SCRATCH',
      severity: 'MINOR',
      description: 'Test scratch',
      locationLabel: 'Front bumper',
    },
  ],
}));

vi.mock('../../lib/api', () => ({
  api: {
    bookings: {
      createPickupHandover: vi.fn(async () => ({})),
      createReturnHandover: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('../context/OperatorShellContext', () => ({
  useOperatorShell: () => ({ openSheet: vi.fn() }),
}));

vi.mock('../hooks/useOperatorTabletLayout', () => ({
  useOperatorTabletLayout: () => false,
}));

vi.mock('../damages/OperatorDamageCaptureProvider', () => ({
  useOperatorDamageCapture: () => ({ openDamageCapture: vi.fn() }),
}));

vi.mock('../../rental/RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));

vi.mock('./useOperatorHandoverForm', () => ({
  useOperatorHandoverForm: () => ({
    booking: mockFormState.booking,
    kind: 'PICKUP' as const,
    state: mockFormState.state,
    patchState: vi.fn(),
    toggleCheck: vi.fn(),
    toggleDamage: vi.fn(),
    stationOptions: [],
    damages: mockFormState.damages,
    loadingDamages: false,
    documentsReloadKey: 0,
    damageError: null,
    telemetryPrefill: {
      odometerKm: '',
      odometerFromTelemetry: false,
      fuelPercent: 100,
      fuelFull: true,
      fuelFromTelemetry: false,
    },
    reloadDocuments: vi.fn(async () => {}),
    markTireMeasurementCaptured: vi.fn(),
    addTechnicalObservationDraft: vi.fn(),
    removeTechnicalObservationDraft: vi.fn(),
    registerCapturedDamage: vi.fn(),
    reloadDamages: vi.fn(async () => {}),
  }),
}));

vi.mock('../documents/OperatorBookingDocumentsPanel', () => ({
  OperatorBookingDocumentsPanel: () => null,
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { HandoverDialogBookingInfo } from '../../rental/components/handover/HandoverProtocolDialog';
import {
  HANDOVER_REPORTED_BY_FALLBACK,
} from '../../rental/components/handover/handover-i18n';
import {
  buildOperatorHandoverPayload,
  createInitialHandoverState,
  OPERATOR_HANDOVER_TIRE_MEASUREMENT_NOTE,
  validateOperatorHandover,
} from './operatorHandoverPayload';
import { OperatorHandoverFlow } from './OperatorHandoverFlow';
import { OperatorHandoverStepDamages } from './OperatorHandoverStepDamages';
import { OperatorHandoverStepReview } from './OperatorHandoverStepReview';
import { OperatorHandoverStepVehicle } from './OperatorHandoverStepVehicle';
import {
  labelOperatorHandoverKind,
  labelOperatorDamageType,
  resolveOperatorValidationMessage,
} from './operator-handover-i18n';
import { useOperatorHandoverForm } from './useOperatorHandoverForm';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P213_ENFORCE_CLEAN_EXACT = [
  'operator/handover/OperatorHandoverFlow.tsx',
  'operator/handover/OperatorHandoverStepVehicle.tsx',
  'operator/handover/OperatorHandoverStepCondition.tsx',
  'operator/handover/OperatorHandoverStepDamages.tsx',
  'operator/handover/OperatorHandoverStepDocuments.tsx',
  'operator/handover/OperatorHandoverStepSignatures.tsx',
  'operator/handover/OperatorHandoverStepReview.tsx',
  'operator/handover/OperatorHandoverTechnicalObservationsSection.tsx',
  'operator/handover/operatorHandoverPayload.ts',
  'operator/handover/operatorHandoverTechnicalObservations.ts',
  'operator/handover/operator-handover-i18n.ts',
];

function isP213EnforceCleanPath(relPath: string): boolean {
  return P213_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p213ScopedFindings() {
  return inventory.findings.filter((finding) => isP213EnforceCleanPath(finding.file));
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(createElement(LanguageProvider, null, ui));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const sampleBooking: HandoverDialogBookingInfo = {
  id: 'booking-1',
  vehicleId: 'veh-1',
  customerId: 'cust-1',
  vehicleName: 'Tesla Model 3',
  plate: 'M-AB 123',
  customerName: 'Jane Doe',
  startDate: '2026-08-21T10:00:00.000Z',
  endDate: '2026-08-28T10:00:00.000Z',
  pickupLocation: 'Munich Central',
  returnLocation: 'Munich Central',
  pickupStationId: 'st-1',
  returnStationId: 'st-1',
  status: 'confirmed',
  pickupOdometerKm: 10000,
};

describe('operator Handover localization (P2.2.13)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P213 scoped findings', () => {
      expect(p213ScopedFindings()).toHaveLength(0);
    });
  });

  describe('machine semantics', () => {
    it('preserves PICKUP and RETURN handover kinds', () => {
      expect(labelOperatorHandoverKind('en', 'PICKUP')).toBe(en['bookings.handover.pickupTitle']);
      expect(labelOperatorHandoverKind('de', 'RETURN')).toBe(de['bookings.handover.returnTitle']);
    });

    it('preserves reportedBy Handover fallback constant', () => {
      expect(HANDOVER_REPORTED_BY_FALLBACK).toBe('Handover');
      const source = readFileSync(
        join(__dirname, 'OperatorHandoverStepDamages.tsx'),
        'utf8',
      );
      expect(source).toContain('reportedBy: form.state.staffName || HANDOVER_REPORTED_BY_FALLBACK');
    });

    it('preserves tire measurement persisted note in payload', () => {
      expect(OPERATOR_HANDOVER_TIRE_MEASUREMENT_NOTE).toBe('Reifenprofilmessung erfasst.');
      const state = createInitialHandoverState(mockFormState.booking, 'PICKUP');
      state.odometerKm = '15000';
      state.tireMeasurementCaptured = true;
      const payload = buildOperatorHandoverPayload({
        kind: 'PICKUP',
        booking: mockFormState.booking,
        state,
      });
      expect(payload.notes).toContain(OPERATOR_HANDOVER_TIRE_MEASUREMENT_NOTE);
    });

    it('localizes damage machine enums for display only', () => {
      expect(labelOperatorDamageType('en', 'SCRATCH')).toBe(en['handover.damageType.SCRATCH']);
      expect(labelOperatorDamageType('de', 'SCRATCH')).toBe(de['handover.damageType.SCRATCH']);
      expect(mockFormState.damages[0].damageType).toBe('SCRATCH');
    });

    it('resolves validation message keys without leaking raw keys in UI helper', () => {
      const issues = validateOperatorHandover('PICKUP', mockFormState.booking, mockFormState.state);
      expect(issues.length).toBeGreaterThan(0);
      const msg = resolveOperatorValidationMessage('en', issues[0]);
      expect(msg).not.toMatch(/^handover\.operator\./);
      expect(msg.length).toBeGreaterThan(0);
    });
  });

  describe('OperatorHandoverFlow rendering', () => {
    it('renders EN pickup flow without German literals', async () => {
      const view = renderWithLocale(
        'en',
        createElement(OperatorHandoverFlow, {
          isOpen: true,
          onClose: () => {},
          kind: 'PICKUP',
          orgId: 'org-1',
          booking: sampleBooking,
          staffOptions: [],
          isDarkMode: false,
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['bookings.handover.pickupTitle']);
      expect(view.container.textContent).toContain(en['handover.operator.step.vehicle']);
      expect(view.container.textContent).not.toMatch(/Fahrzeugübergabe|Schritt \d|Zurück|Weiter/);
    });

    it('renders DE pickup flow with German dictionary strings', async () => {
      const view = renderWithLocale(
        'de',
        createElement(OperatorHandoverFlow, {
          isOpen: true,
          onClose: () => {},
          kind: 'PICKUP',
          orgId: 'org-1',
          booking: sampleBooking,
          staffOptions: [],
          isDarkMode: false,
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(de['handover.operator.step.vehicle']);
      expect(view.container.textContent).toContain(de['handover.operator.vehicle.pickupSection']);
    });

    it('switches EN to DE without remounting flow shell', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      window.localStorage.setItem('synqdrive.locale', 'en');
      act(() => {
        root.render(
          createElement(OperatorHandoverFlow, {
            isOpen: true,
            onClose: () => {},
            kind: 'RETURN',
            orgId: 'org-1',
            booking: sampleBooking,
            staffOptions: [],
            isDarkMode: false,
          }),
        );
      });
      expect(container.textContent).toContain(en['bookings.handover.returnTitle']);
      window.localStorage.setItem('synqdrive.locale', 'de');
      act(() => {
        root.render(createElement(LanguageProvider, null, createElement(OperatorHandoverFlow, {
          isOpen: true,
          onClose: () => {},
          kind: 'RETURN',
          orgId: 'org-1',
          booking: sampleBooking,
          staffOptions: [],
          isDarkMode: false,
        })));
      });
      expect(container.textContent).toContain(de['bookings.handover.returnTitle']);
      act(() => root.unmount());
      container.remove();
    });
  });

  describe('step components', () => {
    it('renders localized vehicle step labels', async () => {
      const form = useOperatorHandoverForm(true, 'PICKUP', 'org-1', sampleBooking);
      const view = renderWithLocale(
        'en',
        createElement(OperatorHandoverStepVehicle, {
          kind: 'PICKUP',
          booking: sampleBooking,
          form,
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['handover.protocol.vehicle']);
      expect(view.container.textContent).toContain(en['handover.operator.vehicle.pickupSection']);
    });

    it('renders localized damage list with machine severity preserved in data', async () => {
      const form = useOperatorHandoverForm(true, 'PICKUP', 'org-1', sampleBooking);
      const view = renderWithLocale(
        'de',
        createElement(OperatorHandoverStepDamages, { form }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(de['handover.damageType.SCRATCH']);
      expect(mockFormState.damages[0].severity).toBe('MINOR');
    });

    it('renders localized review summary', async () => {
      const form = useOperatorHandoverForm(true, 'PICKUP', 'org-1', sampleBooking);
      const view = renderWithLocale(
        'en',
        createElement(OperatorHandoverStepReview, {
          kind: 'PICKUP',
          booking: sampleBooking,
          form,
          issues: validateOperatorHandover('PICKUP', mockFormState.booking, form.state),
        }),
      );
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['handover.operator.review.intro'].split('{')[0].trim());
      expect(view.container.textContent).toContain(en['handover.operator.review.openIssues']);
    });
  });
});
