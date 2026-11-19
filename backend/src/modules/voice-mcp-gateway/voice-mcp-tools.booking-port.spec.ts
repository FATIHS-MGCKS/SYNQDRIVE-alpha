import { Test, TestingModule } from '@nestjs/testing';
import { VoiceMcpToolsService } from './voice-mcp-tools.service';
import { VOICE_BOOKING_READ_PORT } from './ports/voice-booking-read.port';
import { CustomersService } from '@modules/customers/customers.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { InvoiceListReadService } from '@modules/invoices/invoice-list-read.service';
import { StationsService } from '@modules/stations/stations.service';
import { OrganizationsService } from '@modules/organizations/organizations.service';
import { VoiceMcpEntityResolverService } from './voice-mcp-entity-resolver.service';
import { PrismaService } from '@shared/database/prisma.service';
import { VoiceMcpActionOrchestratorService } from './voice-mcp-action-orchestrator.service';
import { VoiceMcpError } from './voice-mcp-errors';

describe('VoiceMcpToolsService — booking read port', () => {
  let service: VoiceMcpToolsService;

  const bookingRead = {
    searchBookings: jest.fn(),
    getBookingById: jest.fn(),
  };
  const entityResolver = {
    resolveVehicleIdByLicensePlate: jest.fn(),
    resolveBookingIdByRef: jest.fn(),
    resolveCustomerIdByRef: jest.fn(),
  };
  const vehiclesService = {
    findOne: jest.fn(),
  };

  const context = {
    organizationId: 'org-1',
    voiceAssistantId: 'assistant-1',
    agentDeploymentId: 'deploy-1',
    conversationId: 'conv-1',
    allowedTools: ['get_booking_status', 'get_vehicle_status'],
    scopes: [],
    issuedAt: 1,
    expiresAt: 2,
    nonce: 'n',
    requestId: 'r',
    correlationId: 'c',
    callerPhoneE164: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoiceMcpToolsService,
        { provide: CustomersService, useValue: { findAll: jest.fn(), findById: jest.fn() } },
        { provide: VOICE_BOOKING_READ_PORT, useValue: bookingRead },
        { provide: VehiclesService, useValue: vehiclesService },
        { provide: InvoiceListReadService, useValue: { list: jest.fn() } },
        { provide: StationsService, useValue: { findAll: jest.fn() } },
        { provide: OrganizationsService, useValue: { getTenantProfile: jest.fn() } },
        { provide: VoiceMcpEntityResolverService, useValue: entityResolver },
        { provide: PrismaService, useValue: { voiceAssistant: { findFirst: jest.fn() } } },
        { provide: VoiceMcpActionOrchestratorService, useValue: { executeWriteTool: jest.fn() } },
      ],
    }).compile();

    service = module.get(VoiceMcpToolsService);
  });

  it('returns DataUnavailable when booking search is ambiguous', async () => {
    bookingRead.searchBookings.mockResolvedValue({
      data: [
        { id: 'b1', vehicleId: 'v1', status: 'A', statusEnum: 'A', customerName: '', vehicleName: '', vehicleLicense: '', pickupStationName: null, returnStationName: null, station: null, startDate: '', endDate: '' },
        { id: 'b2', vehicleId: 'v2', status: 'B', statusEnum: 'B', customerName: '', vehicleName: '', vehicleLicense: '', pickupStationName: null, returnStationName: null, station: null, startDate: '', endDate: '' },
      ],
      total: 2,
    });

    await expect(
      service.execute(context as never, {
        name: 'get_booking_status',
        arguments: { search: 'ambiguous' },
      }),
    ).rejects.toBeInstanceOf(VoiceMcpError);

    expect(bookingRead.searchBookings).toHaveBeenCalledWith('org-1', {
      search: 'ambiguous',
      page: 1,
      limit: 2,
    });
  });

  it('getVehicleStatus resolves vehicle via single booking fallback', async () => {
    entityResolver.resolveVehicleIdByLicensePlate.mockResolvedValue(null);
    bookingRead.searchBookings.mockResolvedValue({
      data: [
        {
          id: 'b1',
          vehicleId: 'v-fallback',
          status: 'Active',
          statusEnum: 'ACTIVE',
          customerName: 'A',
          vehicleName: 'Car',
          vehicleLicense: 'B-1',
          pickupStationName: null,
          returnStationName: null,
          station: null,
          startDate: '2026-01-01',
          endDate: '2026-01-02',
        },
      ],
      total: 1,
    });
    vehiclesService.findOne.mockResolvedValue({
      licensePlate: 'B-1',
      vehicleName: 'Car',
      status: 'AVAILABLE',
    });

    const result = await service.execute(context as never, {
      name: 'get_vehicle_status',
      arguments: { licensePlate: 'B-1' },
    });

    expect(vehiclesService.findOne).toHaveBeenCalledWith('org-1', 'v-fallback');
    expect(result).toEqual(expect.objectContaining({ licensePlate: 'B-1' }));
  });
});