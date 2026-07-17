import { StationOperationsService } from '../station-operations.service';

export const stationOperationsServiceMock = {
  resolveForStation: jest.fn(),
  getContractMetadata: jest.fn(),
} as unknown as StationOperationsService;
