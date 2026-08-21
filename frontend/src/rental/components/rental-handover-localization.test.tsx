// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    stations: { list: vi.fn(async () => []) },
    misuseCases: { list: vi.fn(async () => ({ meta: { total: 0 } })) },
    vehicles: { telemetry: vi.fn(async () => null) },
    vehicleIntelligence: {
      damagesActive: vi.fn(async () => []),
      createDamage: vi.fn(async (vehicleId: string, payload: Record<string, unknown>) => ({
        id: 'dmg-new',
        ...payload,
        vehicleId,
      })),
    },
    bookings: {
      createPickupHandover: vi.fn(async () => ({})),
      createReturnHandover: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('../FleetContext', () => ({
  useFleetVehicles: () => ({ fleetVehicles: [] }),
}));

vi.mock('../lib/useHandoverVehicleTelemetryPrefill', () => ({
  useHandoverVehicleTelemetryPrefill: () => ({
    prefill: {
      odometerKm: '',
      odometerFromTelemetry: false,
      fuelPercent: 100,
      fuelFull: true,
      fuelFromTelemetry: false,
    },
    vehicle: null,
    loading: false,
  }),
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
import { BookingHandoverTab } from './booking-detail/BookingHandoverTab';
import type { BookingDetailDto } from '../../lib/api';
import { getBookingActionMatrix } from './booking-detail/bookingActionRules';
import {
  HandoverProtocolDialog,
  type HandoverDialogBookingInfo,
} from './handover/HandoverProtocolDialog';
import { SignaturePad } from './handover/SignaturePad';
import {
  HANDOVER_REPORTED_BY_FALLBACK,
  resolveHandoverGateReason,
} from './handover/handover-i18n';
import {
  deriveBookingPickupGate,
  deriveBookingReturnGate,
} from '../lib/bookingHandoverGates';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P211_ENFORCE_CLEAN_EXACT = [
  'rental/components/handover/HandoverProtocolDialog.tsx',
  'rental/components/handover/SignaturePad.tsx',
  'rental/components/booking-detail/BookingHandoverTab.tsx',
  'rental/lib/bookingHandoverGates.ts',
  'rental/components/handover/handover-i18n.ts',
];

function isP211EnforceCleanPath(relPath: string): boolean {
  return P211_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p211ScopedFindings() {
  return inventory.findings.filter((finding) => isP211EnforceCleanPath(finding.file));
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
  pickupOdometerKm: null,
};

function buildDetail(partial: Partial<BookingDetailDto> = {}): BookingDetailDto {
  return {
    core: {
      bookingId: 'booking-1',
      status: 'confirmed',
      statusEnum: 'CONFIRMED',
      startDate: '2026-08-21T10:00:00.000Z',
      endDate: '2026-08-28T10:00:00.000Z',
      pickupStationName: 'Munich',
      returnStationName: 'Munich',
      pickupStationId: 'st-1',
      returnStationId: 'st-1',
      kmIncluded: 1000,
    },
    customer: { customerId: 'cust-1', fullName: 'Jane Doe' },
    vehicle: { vehicleId: 'veh-1', displayName: 'Tesla Model 3', licensePlate: 'M-AB 123', rentalBlocked: false },
    handover: { pickup: null, return: null },
    health: { rentalBlocked: false, blockingReasons: [] },
    eligibility: { canStartRental: true, blockingReasons: [] },
    documents: { legalTermsAttached: true, legalWithdrawalAttached: true },
    finance: { finalInvoiceStatus: null },
    stations: null,
    ...partial,
  } as BookingDetailDto;
}

describe('rental Handover Protocol localization (P2.2.11)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P211 scoped findings', () => {
      expect(p211ScopedFindings()).toHaveLength(0);
    });
  });

  describe('gate machine semantics', () => {
    it('preserves pickup gate booleans and machine reason keys', () => {
      const blocked = deriveBookingPickupGate({
        statusEnum: 'ACTIVE',
        status: 'active',
        hasPickupProtocol: false,
        hasReturnProtocol: false,
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.reasonKey).toBe('handover.gates.pickupWrongStatus');
      expect(resolveHandoverGateReason('en', blocked)).toBe(en['handover.gates.pickupWrongStatus']);

      const allowed = deriveBookingPickupGate({
        statusEnum: 'CONFIRMED',
        status: 'confirmed',
        hasPickupProtocol: false,
        hasReturnProtocol: false,
        rentalBlocked: false,
        canStartRental: true,
      });
      expect(allowed.allowed).toBe(true);
      expect(allowed.reasonKey).toBeUndefined();
    });

    it('preserves RETURN gate booleans', () => {
      const blocked = deriveBookingReturnGate({
        statusEnum: 'CONFIRMED',
        status: 'confirmed',
        hasPickupProtocol: false,
        hasReturnProtocol: false,
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.reasonKey).toBe('handover.gates.returnNotActive');

      const allowed = deriveBookingReturnGate({
        statusEnum: 'ACTIVE',
        status: 'active',
        hasPickupProtocol: true,
        hasReturnProtocol: false,
      });
      expect(allowed.allowed).toBe(true);
    });

    it('passes machine blocking reasons through without translation', () => {
      const gate = deriveBookingPickupGate({
        statusEnum: 'CONFIRMED',
        status: 'confirmed',
        hasPickupProtocol: false,
        hasReturnProtocol: false,
        rentalBlocked: true,
        blockingReasons: ['RENTAL_BLOCKED'],
      });
      expect(gate.reasonKey).toBe('handover.gates.pickupBlockedWithReasons');
      expect(gate.reasonParams?.reasons).toBe('RENTAL_BLOCKED');
    });
  });

  describe('HandoverProtocolDialog rendering', () => {
    it('renders EN pickup dialog without German literals', async () => {
      const view = renderWithLocale(
        'en',
        createElement(HandoverProtocolDialog, {
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
      expect(view.container.textContent).toContain(en['handover.protocol.dialogPickupTitle']);
      expect(view.container.textContent).not.toMatch(/Fahrzeugübergabe|Kilometerstand \*|Übergabe durch/);
    });

    it('renders DE pickup dialog with German dictionary strings', async () => {
      const view = renderWithLocale(
        'de',
        createElement(HandoverProtocolDialog, {
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
      expect(view.container.textContent).toContain(de['handover.protocol.dialogPickupTitle']);
      expect(view.container.textContent).toContain(de['handover.protocol.odometer']);
    });

    it('keeps reportedBy fallback machine constant on damage create', () => {
      expect(HANDOVER_REPORTED_BY_FALLBACK).toBe('Handover');
      const source = readFileSync(
        join(__dirname, 'handover/HandoverProtocolDialog.tsx'),
        'utf8',
      );
      expect(source).toContain('reportedBy: staffName || HANDOVER_REPORTED_BY_FALLBACK');
    });
  });

  describe('SignaturePad rendering', () => {
    it('renders EN signature controls', () => {
      const view = renderWithLocale(
        'en',
        createElement(SignaturePad, {
          label: en['handover.signature.customerLabel'],
          isDarkMode: false,
          typedName: '',
          onTypedNameChange: () => {},
          dataUrl: null,
          onDataUrlChange: () => {},
        }),
      );
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(en['handover.signature.draw']);
      expect(view.container.textContent).toContain(en['handover.signature.signHere']);
    });

    it('renders DE signature controls', () => {
      const view = renderWithLocale(
        'de',
        createElement(SignaturePad, {
          label: de['handover.signature.customerLabel'],
          isDarkMode: false,
          typedName: '',
          onTypedNameChange: () => {},
          dataUrl: null,
          onDataUrlChange: () => {},
        }),
      );
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(de['handover.signature.draw']);
      expect(view.container.textContent).toContain(de['handover.signature.signHere']);
    });
  });

  describe('BookingHandoverTab rendering', () => {
    it('localizes tab rows and actions in EN', () => {
      const detail = buildDetail();
      const matrix = getBookingActionMatrix(detail);
      const view = renderWithLocale(
        'en',
        createElement(BookingHandoverTab, {
          detail,
          matrix,
          onPickup: () => {},
          onReturn: () => {},
        }),
      );
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(en['handover.tab.startPickup']);
      expect(view.container.textContent).toContain(en['bookings.handover.noProtocol']);
      expect(view.container.textContent).not.toMatch(/Zeitpunkt|Mitarbeiter/);
    });

    it('shows localized return action in DE when pickup exists', () => {
      const detail = buildDetail({
        handover: {
          pickup: {
            completedAt: '2026-08-21T11:00:00Z',
            performedByName: 'Staff',
            odometerKm: 100,
            fuelFull: true,
            fuelPercent: 100,
            damageCount: 0,
            signatureComplete: true,
          } as BookingDetailDto['handover']['pickup'],
          return: null,
        },
      });
      const matrix = getBookingActionMatrix(detail);
      const view = renderWithLocale(
        'de',
        createElement(BookingHandoverTab, {
          detail,
          matrix,
          onPickup: () => {},
          onReturn: () => {},
        }),
      );
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(de['handover.tab.startReturn']);
    });
  });

  describe('machine kind constants', () => {
    it('preserves PICKUP and RETURN kind values in dialog source', () => {
      const source = readFileSync(
        join(__dirname, 'handover/HandoverProtocolDialog.tsx'),
        'utf8',
      );
      expect(source).toContain("'PICKUP' | 'RETURN'");
      expect(source).toContain("kind === 'PICKUP' ? 'PICKUP_HANDOVER' : 'RETURN_HANDOVER'");
    });
  });
});
