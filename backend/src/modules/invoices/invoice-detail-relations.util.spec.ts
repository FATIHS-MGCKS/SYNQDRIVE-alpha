import { OrgInvoiceStatus } from '@prisma/client';
import {
  BOOKING_REF,
  CUSTOMER_MUELLER,
  INVOICE_BOOKING,
  ORG_A,
  ORG_B,
  VEHICLE_GOLF,
  makeOrgInvoiceRow,
} from './__fixtures__/invoice-baseline.fixtures';
import {
  assertNoUuidPrimaryDisplay,
  buildCustomerDivergence,
  formatCentralVehicleDisplayName,
  mapInvoiceBookingSummary,
  mapInvoiceCustomerSummary,
  mapInvoiceVehicleSummary,
  parseInvoiceRelationSnapshots,
} from './invoice-detail-relations.util';

describe('invoice-detail-relations.util', () => {
  describe('mapInvoiceCustomerSummary', () => {
    it('maps private customer with display name and customer number', () => {
      const summary = mapInvoiceCustomerSummary({
        customerId: CUSTOMER_MUELLER,
        customer: {
          id: CUSTOMER_MUELLER,
          firstName: 'Anna',
          lastName: 'Schmidt',
          email: 'anna@example.com',
          phone: '+49111',
          company: null,
          status: 'ACTIVE',
          customerType: 'INDIVIDUAL',
          archivedAt: null,
        },
        snapshots: {},
      });
      expect(summary?.displayName).toBe('Anna Schmidt');
      expect(summary?.customerNumber).toMatch(/^K-/);
      expect(summary?.navigation?.routeKey).toBe('customer-detail');
      assertNoUuidPrimaryDisplay(summary!.displayName);
    });

    it('maps business customer preferring company name', () => {
      const summary = mapInvoiceCustomerSummary({
        customerId: CUSTOMER_MUELLER,
        customer: {
          id: CUSTOMER_MUELLER,
          firstName: 'Max',
          lastName: 'Müller',
          email: 'office@acme.de',
          phone: null,
          company: 'ACME GmbH',
          status: 'ACTIVE',
          customerType: 'CORPORATE',
          archivedAt: null,
        },
        snapshots: {},
      });
      expect(summary?.displayName).toBe('ACME GmbH');
      expect(summary?.companyName).toBe('ACME GmbH');
    });

    it('returns deleted customer state with snapshot fallback', () => {
      const summary = mapInvoiceCustomerSummary({
        customerId: CUSTOMER_MUELLER,
        customer: null,
        snapshots: { customerDisplayName: 'Historischer Kunde GmbH' },
      });
      expect(summary?.availability).toBe('DELETED');
      expect(summary?.displayName).toBe('Historischer Kunde GmbH');
      expect(summary?.navigation).toBeNull();
    });
  });

  describe('mapInvoiceBookingSummary', () => {
    it('maps booking with stations and public booking number', () => {
      const summary = mapInvoiceBookingSummary({
        bookingId: BOOKING_REF,
        booking: {
          id: BOOKING_REF,
          customerId: CUSTOMER_MUELLER,
          status: 'CONFIRMED',
          startDate: new Date('2026-07-10T08:00:00.000Z'),
          endDate: new Date('2026-07-13T18:00:00.000Z'),
          pickupStationId: 'st-1',
          returnStationId: 'st-2',
          pickupStation: { id: 'st-1', name: 'Hauptbahnhof', code: 'HB' },
          returnStation: { id: 'st-2', name: 'Flughafen', code: 'FL' },
        },
      });
      expect(summary?.bookingNumber).toBe(`BK-${BOOKING_REF.slice(-6).toUpperCase()}`);
      expect(summary?.reference).toBe(`BK-${BOOKING_REF.slice(-6).toUpperCase()}`);
      expect(summary?.pickupStation?.name).toBe('Hauptbahnhof');
      expect(summary?.navigation?.routeKey).toBe('bookings');
    });

    it('returns null when invoice has no booking link', () => {
      expect(
        mapInvoiceBookingSummary({ bookingId: null, booking: null }),
      ).toBeNull();
    });

    it('returns deleted booking when id linked but row missing', () => {
      const summary = mapInvoiceBookingSummary({
        bookingId: BOOKING_REF,
        booking: null,
      });
      expect(summary?.availability).toBe('DELETED');
      expect(summary?.unavailableLabel).toContain('nicht mehr verfügbar');
    });
  });

  describe('mapInvoiceVehicleSummary', () => {
    it('maps vehicle with license plate in display', () => {
      const summary = mapInvoiceVehicleSummary({
        vehicleId: VEHICLE_GOLF,
        vehicle: {
          id: VEHICLE_GOLF,
          make: 'VW',
          model: 'Golf',
          year: 2024,
          licensePlate: 'M-AB 100',
          vin: 'WVWZZZ1JZXW000001',
          vehicleName: null,
          status: 'AVAILABLE',
        },
        snapshots: {},
        includeVin: false,
      });
      expect(summary?.displayName).toContain('Golf');
      expect(summary?.licensePlate).toBe('M-AB 100');
      expect(summary?.vin).toBeNull();
      assertNoUuidPrimaryDisplay(summary!.displayName);
    });

    it('uses make/model when license plate missing', () => {
      const summary = mapInvoiceVehicleSummary({
        vehicleId: VEHICLE_GOLF,
        vehicle: {
          id: VEHICLE_GOLF,
          make: 'BMW',
          model: 'X3',
          year: 2022,
          licensePlate: null,
          vin: 'VIN',
          vehicleName: null,
          status: 'AVAILABLE',
        },
        snapshots: {},
        includeVin: false,
      });
      expect(summary?.displayName).toBe('BMW X3');
    });

    it('returns unavailable label when vehicle deleted and no snapshot', () => {
      const summary = mapInvoiceVehicleSummary({
        vehicleId: VEHICLE_GOLF,
        vehicle: null,
        snapshots: {},
        includeVin: false,
      });
      expect(summary?.displayName).toBe('Fahrzeugdaten nicht verfügbar');
      expect(summary?.availability).toBe('DELETED');
    });

    it('marks archived vehicle when out of service', () => {
      const summary = mapInvoiceVehicleSummary({
        vehicleId: VEHICLE_GOLF,
        vehicle: {
          id: VEHICLE_GOLF,
          make: 'VW',
          model: 'Golf',
          year: 2020,
          licensePlate: 'OLD-1',
          vin: 'VIN',
          vehicleName: 'Flotte 12',
          status: 'OUT_OF_SERVICE',
        },
        snapshots: {},
        includeVin: true,
      });
      expect(summary?.availability).toBe('ARCHIVED');
      expect(summary?.fleetName).toBe('Flotte 12');
      expect(summary?.vin).toBe('VIN');
    });
  });

  describe('buildCustomerDivergence', () => {
    it('detects invoice vs booking customer mismatch', () => {
      const divergence = buildCustomerDivergence({
        invoiceCustomerId: CUSTOMER_MUELLER,
        booking: {
          id: BOOKING_REF,
          customerId: 'other-customer-id',
          status: 'CONFIRMED',
          startDate: new Date(),
          endDate: new Date(),
          pickupStationId: null,
          returnStationId: null,
        },
      });
      expect(divergence.customerDiverges).toBe(true);
      expect(divergence.message).toContain('Rechnungskunde');
    });

    it('no divergence when booking missing', () => {
      const divergence = buildCustomerDivergence({
        invoiceCustomerId: CUSTOMER_MUELLER,
        booking: null,
      });
      expect(divergence.customerDiverges).toBe(false);
    });
  });

  describe('formatCentralVehicleDisplayName', () => {
    it('never returns uuid-like primary display', () => {
      const name = formatCentralVehicleDisplayName(null, {});
      expect(name).toBe('Fahrzeugdaten nicht verfügbar');
    });
  });

  describe('parseInvoiceRelationSnapshots', () => {
    it('extracts historical labels from extractedData', () => {
      const snapshots = parseInvoiceRelationSnapshots({
        customerName: 'Snapshot Kunde',
        licensePlate: 'SN-123',
      });
      expect(snapshots.customerDisplayName).toBe('Snapshot Kunde');
      expect(snapshots.licensePlate).toBe('SN-123');
    });
  });
});
