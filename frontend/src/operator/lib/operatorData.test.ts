import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../lib/api';
import {
  mapPickupRow,
  mapReturnRow,
  mapScanBookingToDetailItem,
} from './operatorData';
import type { OperatorScanBookingHit } from '../hooks/useOperatorScanSearch';

const healthMap = new Map<string, VehicleHealthResponse>();

describe('operatorData booking mappers', () => {
  const nowMs = new Date('2026-07-25T12:00:00.000Z').getTime();

  it('maps pickup row using backend overdue flag only', () => {
    const item = mapPickupRow(
      {
        id: 'bk-1',
        vehicleId: 'veh-1',
        vehicleName: 'BMW i4',
        vehicleLicense: 'KS-AB 1',
        customerName: 'Max Mustermann',
        startDate: '2026-07-25T10:00:00.000Z',
        endDate: '2026-07-27T10:00:00.000Z',
        statusEnum: 'CONFIRMED',
        status: 'Confirmed',
        isOverdue: true,
        minutesOverdue: 120,
        pickupStationName: 'Kassel',
      },
      healthMap,
      'de',
      nowMs,
    );
    expect(item?.isOverdue).toBe(true);
    expect(item?.status).toBe('confirmed');
    expect(item?.station).toBe('Kassel');
    expect(item?.bookingId).toBe('bk-1');
  });

  it('maps return row scheduledAt from endDate', () => {
    const item = mapReturnRow(
      {
        id: 'bk-2',
        vehicleId: 'veh-2',
        vehicleName: 'Audi Q4',
        vehicleLicense: 'KS-CD 2',
        customerName: 'Anna Test',
        startDate: '2026-07-23T10:00:00.000Z',
        endDate: '2026-07-25T14:00:00.000Z',
        statusEnum: 'ACTIVE',
        status: 'Active',
        isOverdue: false,
        returnStationName: 'Fulda',
        pickupProtocol: { id: 'p1' },
      },
      'de',
      nowMs,
    );
    expect(item?.kind).toBe('RETURN');
    expect(item?.scheduledAt).toBe('2026-07-25T14:00:00.000Z');
    expect(item?.station).toBe('Fulda');
  });

  it('maps scan hit with status-based kind and preserves overdue when provided', () => {
    const hit: OperatorScanBookingHit = {
      bookingId: 'bk-3',
      vehicleId: 'veh-3',
      vehicleName: 'VW ID.3',
      plate: 'KS-EF 3',
      customerName: 'Scan User',
      status: 'Active',
      statusEnum: 'ACTIVE',
      startDate: '2026-07-20T08:00:00.000Z',
      endDate: '2026-07-25T16:00:00.000Z',
      pickupProtocol: true,
      isOverdue: true,
    };
    const item = mapScanBookingToDetailItem(hit, 'de', nowMs);
    expect(item.kind).toBe('RETURN');
    expect(item.isOverdue).toBe(true);
    expect(item.status).toBe('active');
    expect(item.plate).toBe('KS-EF 3');
  });
});
