import type { StationDomainAuditService } from '../station-domain-audit.service';

export const stationDomainAuditServiceMock = {
  record: jest.fn().mockResolvedValue(undefined),
  recordForStations: jest.fn().mockResolvedValue(undefined),
  recordStationCreated: jest.fn().mockResolvedValue(undefined),
  recordStationUpdated: jest.fn().mockResolvedValue(undefined),
} as jest.Mocked<
  Pick<
    StationDomainAuditService,
    'record' | 'recordForStations' | 'recordStationCreated' | 'recordStationUpdated'
  >
>;
