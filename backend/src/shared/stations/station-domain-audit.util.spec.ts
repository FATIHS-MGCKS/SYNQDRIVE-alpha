import { StationDomainAuditAction } from './station-domain-audit.constants';
import {
  buildStationDomainAuditDescription,
  buildStationDomainChangeSummary,
  buildStationDomainCorrelationId,
  mapTransferCommandToAuditAction,
  resolveStationUpdateAuditActions,
} from './station-domain-audit.util';

describe('station-domain-audit.util', () => {
  describe('buildStationDomainCorrelationId', () => {
    it('builds a stable correlation id from domain fields', () => {
      const id = buildStationDomainCorrelationId({
        auditAction: StationDomainAuditAction.STATION_CREATED,
        organizationId: 'org-1',
        stationId: 'station-1',
        performedAt: '2026-07-18T00:00:00.000Z',
      });

      expect(id).toBe('org-1:STATION_CREATED:station-1:::::2026-07-18T00:00:00.000Z');
    });
  });

  describe('buildStationDomainChangeSummary', () => {
    it('formats from → to labels', () => {
      expect(buildStationDomainChangeSummary('ACTIVE', 'ARCHIVED')).toBe('ACTIVE → ARCHIVED');
      expect(buildStationDomainChangeSummary(null, 'Berlin')).toBe('— → Berlin');
    });
  });

  describe('resolveStationUpdateAuditActions', () => {
    it('maps master data and operations hints separately', () => {
      expect(
        resolveStationUpdateAuditActions([
          { command: 'UpdateStationMasterData' },
          { command: 'UpdateOpeningCalendar' },
        ]),
      ).toEqual([
        StationDomainAuditAction.MASTER_DATA_UPDATED,
        StationDomainAuditAction.OPERATIONS_UPDATED,
      ]);
    });

    it('deduplicates multiple hints in the same category', () => {
      expect(
        resolveStationUpdateAuditActions([
          { command: 'UpdateStationMasterData' },
          { command: 'UpdateStationTeam' },
        ]),
      ).toEqual([StationDomainAuditAction.MASTER_DATA_UPDATED]);
    });
  });

  describe('mapTransferCommandToAuditAction', () => {
    it('maps transfer commands to canonical audit actions', () => {
      expect(mapTransferCommandToAuditAction('PlanVehicleStationTransfer')).toBe(
        StationDomainAuditAction.TRANSFER_PLANNED,
      );
      expect(mapTransferCommandToAuditAction('StartVehicleStationTransfer')).toBe(
        StationDomainAuditAction.TRANSFER_STARTED,
      );
      expect(mapTransferCommandToAuditAction('ArriveVehicleStationTransfer')).toBe(
        StationDomainAuditAction.TRANSFER_COMPLETED,
      );
      expect(mapTransferCommandToAuditAction('CancelVehicleStationTransfer')).toBe(
        StationDomainAuditAction.TRANSFER_CANCELLED,
      );
      expect(mapTransferCommandToAuditAction('MarkVehicleStationTransferReady')).toBeNull();
    });
  });

  describe('buildStationDomainAuditDescription', () => {
    it('returns human-readable descriptions', () => {
      expect(buildStationDomainAuditDescription(StationDomainAuditAction.BOOKING_RULE_OVERRIDDEN)).toBe(
        'Station booking rule overridden',
      );
    });
  });
});
