import { Test, TestingModule } from '@nestjs/testing';
import { VoiceMcpToolsService, VoiceMcpGatewayMiddlewareService } from './voice-mcp-tools.service';
import { CustomersService } from '@modules/customers/customers.service';
import { BookingsService } from '@modules/bookings/bookings.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { InvoiceListReadService } from '@modules/invoices/invoice-list-read.service';
import { StationsService } from '@modules/stations/stations.service';
import { OrganizationsService } from '@modules/organizations/organizations.service';
import { VoiceMcpEntityResolverService } from './voice-mcp-entity-resolver.service';
import { PrismaService } from '@shared/database/prisma.service';
import { VoiceMcpActionOrchestratorService } from './voice-mcp-action-orchestrator.service';
import {
  VoiceAgentDeploymentRepository,
  VoiceSubscriptionRepository,
} from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { VoiceEntitlementService } from '@modules/voice-entitlement/voice-entitlement.service';
import { VoiceMcpError } from './voice-mcp-errors';

describe('VoiceMcpToolsService', () => {
  let service: VoiceMcpToolsService;

  const customersService = {
    findAll: jest.fn(),
    findById: jest.fn(),
  };
  const bookingsService = {
    findAll: jest.fn(),
    findById: jest.fn(),
  };
  const vehiclesService = {
    findOne: jest.fn(),
  };
  const invoiceListReadService = {
    list: jest.fn(),
  };
  const stationsService = {
    findAll: jest.fn(),
  };
  const organizationsService = {
    getTenantProfile: jest.fn(),
  };
  const entityResolver = {
    resolveCustomerIdByRef: jest.fn(),
    resolveBookingIdByRef: jest.fn(),
    resolveVehicleIdByLicensePlate: jest.fn(),
  };
  const prisma = {
    voiceAssistant: {
      findFirst: jest.fn(),
    },
  };

  const actionOrchestrator = {
    executeWriteTool: jest.fn(),
  };

  const context = {
    organizationId: 'org-1',
    voiceAssistantId: 'assistant-1',
    agentDeploymentId: 'deploy-1',
    conversationId: 'conv-1',
    allowedTools: ['identify_customer'],
    scopes: ['voice:mcp:read'],
    issuedAt: 1,
    expiresAt: 9999999999,
    nonce: 'nonce-1',
    requestId: 'req-1',
    correlationId: 'corr-1',
    callerPhoneE164: '+491701234567',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoiceMcpToolsService,
        { provide: CustomersService, useValue: customersService },
        { provide: BookingsService, useValue: bookingsService },
        { provide: VehiclesService, useValue: vehiclesService },
        { provide: InvoiceListReadService, useValue: invoiceListReadService },
        { provide: StationsService, useValue: stationsService },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: VoiceMcpEntityResolverService, useValue: entityResolver },
        { provide: PrismaService, useValue: prisma },
        { provide: VoiceMcpActionOrchestratorService, useValue: actionOrchestrator },
      ],
    }).compile();

    service = module.get(VoiceMcpToolsService);
  });

  it('identify_customer returns a single minimized match', async () => {
    customersService.findAll.mockResolvedValue({
      data: [
        {
          id: '11111111-2222-3333-4444-555566667777',
          firstName: 'Alex',
          lastName: 'Muster',
          phone: '+491701234567',
          email: 'alex@example.com',
        },
      ],
      total: 1,
    });

    const result = await service.execute(context as never, {
      name: 'identify_customer',
      arguments: { phone: '+491701234567' },
    });

    expect(result.identified).toBe(true);
    expect(result.customer).toEqual(
      expect.objectContaining({
        customerRef: expect.any(String),
        phone: '+491701234567',
      }),
    );
    expect((result.customer as { id?: string }).id).toBeUndefined();
  });

  it('find_booking returns booking references without internal ids', async () => {
    bookingsService.findAll.mockResolvedValue({
      data: [
        {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          status: 'Confirmed',
          customerName: 'Alex Muster',
          vehicleLicense: 'B-AB 123',
          pickupStationName: 'Berlin Mitte',
          startDate: '2026-07-01T10:00:00.000Z',
          endDate: '2026-07-03T10:00:00.000Z',
        },
      ],
      total: 1,
    });

    const result = await service.execute(context as never, {
      name: 'find_booking',
      arguments: { search: 'B-AB 123' },
    });

    expect(result.bookings).toEqual([
      expect.objectContaining({
        bookingRef: expect.any(String),
        vehicleLicense: 'B-AB 123',
      }),
    ]);
    expect((result.bookings as Array<{ id?: string }>)[0].id).toBeUndefined();
  });

  it('get_branch_information returns station details', async () => {
    stationsService.findAll.mockResolvedValue([
      {
        name: 'Berlin Mitte',
        code: 'BER-M',
        typeLabel: 'Branch',
        statusLabel: 'Active',
        addressLine1: 'Alexanderplatz 1',
        postalCode: '10178',
        city: 'Berlin',
        country: 'DE',
        phone: '+4930123456',
        email: 'berlin@example.com',
        pickupEnabled: true,
        returnEnabled: true,
        managerName: 'Sam',
      },
    ]);

    const result = await service.execute(context as never, {
      name: 'get_branch_information',
      arguments: { stationName: 'Berlin' },
    });

    expect(result.name).toBe('Berlin Mitte');
    expect(result.phone).toBe('***3456');
  });
});

describe('VoiceMcpGatewayMiddlewareService', () => {
  let middleware: VoiceMcpGatewayMiddlewareService;

  const prisma = {
    voiceAssistant: {
      findFirst: jest.fn(),
    },
  };
  const subscriptions = {
    listByOrganization: jest.fn(),
  };
  const deployments = {
    findById: jest.fn(),
  };
  let entitlements: VoiceEntitlementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.VOICE_AI_MCP_GATEWAY_ENABLED = 'true';
    entitlements = new VoiceEntitlementService(subscriptions as unknown as VoiceSubscriptionRepository);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoiceMcpGatewayMiddlewareService,
        { provide: PrismaService, useValue: prisma },
        { provide: VoiceSubscriptionRepository, useValue: subscriptions },
        { provide: VoiceAgentDeploymentRepository, useValue: deployments },
        { provide: VoiceEntitlementService, useValue: entitlements },
      ],
    }).compile();

    middleware = module.get(VoiceMcpGatewayMiddlewareService);
  });

  it('rejects foreign organization assistant bindings', async () => {
    prisma.voiceAssistant.findFirst.mockResolvedValue(null);

    await expect(
      middleware.assertTenantBindings({
        organizationId: 'org-1',
        voiceAssistantId: 'assistant-foreign',
        agentDeploymentId: 'deploy-1',
        conversationId: 'conv-1',
        allowedTools: [],
        scopes: [],
        issuedAt: 1,
        expiresAt: 2,
        nonce: 'nonce',
        requestId: 'req',
        correlationId: 'corr',
      }),
    ).rejects.toBeInstanceOf(VoiceMcpError);
  });

  it('requires an active voice subscription', async () => {
    prisma.voiceAssistant.findFirst.mockResolvedValue({ id: 'assistant-1' });
    deployments.findById.mockResolvedValue({
      id: 'deploy-1',
      status: 'ACTIVE',
      voiceAssistantId: 'assistant-1',
    });
    subscriptions.listByOrganization.mockResolvedValue([{ status: 'PENDING' }]);

    await expect(
      middleware.assertTenantBindings({
        organizationId: 'org-1',
        voiceAssistantId: 'assistant-1',
        agentDeploymentId: 'deploy-1',
        conversationId: 'conv-1',
        allowedTools: [],
        scopes: [],
        issuedAt: 1,
        expiresAt: 2,
        nonce: 'nonce',
        requestId: 'req',
        correlationId: 'corr',
      }),
    ).rejects.toMatchObject({ code: 'PermissionDenied' });
  });
});
