import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CustomersService } from '@modules/customers/customers.service';
import { BookingsService } from '@modules/bookings/bookings.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { InvoiceListReadService } from '@modules/invoices/invoice-list-read.service';
import { StationsService } from '@modules/stations/stations.service';
import { OrganizationsService } from '@modules/organizations/organizations.service';
import { VoiceMcpEntityResolverService } from './voice-mcp-entity-resolver.service';
import {
  resolveToolPermissions,
  VoicePermissionMode,
} from '@modules/voice-assistant/voice-assistant-permissions';
import {
  VoiceAgentDeploymentRepository,
  VoiceSubscriptionRepository,
} from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { VoiceToolExecutionRepository } from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { isWithinBusinessHours } from '@modules/voice-assistant/agent-deployment/agent-business-hours.util';
import { buildCanonicalAgentConfigFromAssistant } from '@modules/voice-assistant/agent-deployment/agent-config.builder';
import { isVoiceMcpGatewayEnabled } from './voice-mcp-gateway.config';
import { VoiceMcpError } from './voice-mcp-errors';
import type { VoiceMcpRequestContext, VoiceMcpToolCallInput } from './voice-mcp-context.types';
import { getVoiceMcpToolDefinition } from './voice-mcp-tools.registry';
import {
  hashForAudit,
  maskPhoneNumber,
  redactSensitiveCustomerFields,
  toBookingReference,
  toCustomerReference,
} from './voice-mcp-privacy.util';
import type { VoiceMcpReadOnlyToolName } from './voice-mcp-gateway.constants';

@Injectable()
export class VoiceMcpGatewayMiddlewareService {
  private readonly logger = new Logger(VoiceMcpGatewayMiddlewareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: VoiceSubscriptionRepository,
    private readonly deployments: VoiceAgentDeploymentRepository,
  ) {}

  async assertGatewayReady(organizationId: string): Promise<void> {
    if (!isVoiceMcpGatewayEnabled()) {
      throw new VoiceMcpError('GatewayDisabled', 'The SynqDrive voice MCP gateway is not enabled.');
    }
  }

  async assertTenantBindings(context: VoiceMcpRequestContext): Promise<void> {
    await this.assertGatewayReady(context.organizationId);

    const assistant = await this.prisma.voiceAssistant.findFirst({
      where: { id: context.voiceAssistantId, organizationId: context.organizationId },
    });
    if (!assistant) {
      throw new VoiceMcpError('TenantMismatch', 'The voice assistant does not belong to this organization.');
    }

    const deployment = await this.deployments.findById(context.organizationId, context.agentDeploymentId);
    if (!deployment || deployment.status !== 'ACTIVE') {
      throw new VoiceMcpError('DataUnavailable', 'No active voice agent deployment is available for tool access.');
    }

    if (deployment.voiceAssistantId !== context.voiceAssistantId) {
      throw new VoiceMcpError('TenantMismatch', 'The deployment does not match the voice assistant in this token.');
    }

    const subscriptions = await this.subscriptions.listByOrganization(context.organizationId);
    const activeSubscription = subscriptions.find((row) => row.status === 'ACTIVE');
    if (!activeSubscription) {
      throw new VoiceMcpError('PermissionDenied', 'Voice AI subscription is not active for this organization.');
    }
  }

  async assertToolAllowed(context: VoiceMcpRequestContext, toolName: VoiceMcpReadOnlyToolName): Promise<void> {
    if (!context.allowedTools.includes(toolName)) {
      throw new VoiceMcpError('ToolNotAllowed', `Tool ${toolName} is not allowed for this conversation.`);
    }

    const definition = getVoiceMcpToolDefinition(toolName);
    if (!definition) {
      throw new VoiceMcpError('ToolNotAllowed', `Unknown tool ${toolName}.`);
    }

    const assistant = await this.prisma.voiceAssistant.findFirst({
      where: { id: context.voiceAssistantId, organizationId: context.organizationId },
    });
    if (!assistant) {
      throw new VoiceMcpError('TenantMismatch', 'Voice assistant not found for organization.');
    }

    const permissions = resolveToolPermissions(assistant);
    const mode = permissions[definition.capabilityKey];
    if (!mode || mode === VoicePermissionMode.DISABLED) {
      throw new VoiceMcpError('PermissionDenied', `Capability ${definition.capabilityKey} is disabled for this assistant.`);
    }
  }
}

@Injectable()
export class VoiceMcpAuditService {
  private readonly logger = new Logger(VoiceMcpAuditService.name);

  constructor(private readonly toolExecutions: VoiceToolExecutionRepository) {}

  async recordToolInvocation(
    context: VoiceMcpRequestContext,
    toolName: string,
    input: Record<string, unknown>,
    status: 'SUCCEEDED' | 'FAILED',
  ): Promise<void> {
    try {
      await this.toolExecutions.persistOrGet({
        organizationId: context.organizationId,
        voiceConversationId: context.conversationId,
        toolName,
        riskClass: 'READ_ONLY',
        requestHash: hashForAudit(input),
        idempotencyKey: `${context.conversationId}:${context.requestId}:${toolName}`,
        redactedInput: input as Prisma.InputJsonValue,
      });
    } catch (error) {
      this.logger.warn(`Failed to persist voice MCP audit for ${toolName}: ${(error as Error).message}`);
    }

    this.logger.log(
      JSON.stringify({
        event: 'voice_mcp_tool',
        requestId: context.requestId,
        correlationId: context.correlationId,
        organizationId: context.organizationId,
        conversationId: context.conversationId,
        toolName,
        status,
      }),
    );
  }
}

@Injectable()
export class VoiceMcpToolsService {
  constructor(
    private readonly customersService: CustomersService,
    private readonly bookingsService: BookingsService,
    private readonly vehiclesService: VehiclesService,
    private readonly invoiceListReadService: InvoiceListReadService,
    private readonly stationsService: StationsService,
    private readonly organizationsService: OrganizationsService,
    private readonly entityResolver: VoiceMcpEntityResolverService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(context: VoiceMcpRequestContext, call: VoiceMcpToolCallInput): Promise<Record<string, unknown>> {
    switch (call.name) {
      case 'identify_customer':
        return this.identifyCustomer(context, call.arguments);
      case 'get_customer_summary':
        return this.getCustomerSummary(context, call.arguments);
      case 'find_booking':
        return this.findBooking(context, call.arguments);
      case 'get_booking_status':
        return this.getBookingStatus(context, call.arguments);
      case 'get_vehicle_status':
        return this.getVehicleStatus(context, call.arguments);
      case 'get_invoice_status':
        return this.getInvoiceStatus(context, call.arguments);
      case 'get_branch_information':
        return this.getBranchInformation(context, call.arguments);
      case 'get_business_hours':
        return this.getBusinessHours(context, call.arguments);
      default:
        throw new VoiceMcpError('ToolNotAllowed', `Tool ${call.name} is not implemented.`);
    }
  }

  private async identifyCustomer(
    context: VoiceMcpRequestContext,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const search = this.buildCustomerSearch(args, context);
    const result = await this.customersService.findAll(context.organizationId, {
      search,
      page: 1,
      limit: 5,
    } as never);

    if (!result.data.length) {
      throw new VoiceMcpError('CustomerNotFound', 'No matching customer was found.');
    }
    if (result.data.length > 1) {
      throw new VoiceMcpError('MultipleMatches', 'Multiple customers matched the provided details.', {
        matchCount: result.data.length,
        candidates: result.data.slice(0, 3).map((row) => ({
          customerRef: toCustomerReference(String(row.id)),
          fullName: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
          phone: maskPhoneNumber(typeof row.phone === 'string' ? row.phone : null, {
            revealForCall: this.shouldRevealPhone(context, args),
          }),
        })),
      });
    }

    const customer = result.data[0] as Record<string, unknown>;
    return {
      identified: true,
      customer: redactSensitiveCustomerFields(customer, {
        revealPhoneForCall: this.shouldRevealPhone(context, args),
      }),
    };
  }

  private async getCustomerSummary(
    context: VoiceMcpRequestContext,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const customer = await this.resolveCustomer(context, args);
    if (!customer) {
      throw new VoiceMcpError('CustomerNotFound', 'No matching customer was found.');
    }

    return {
      customerRef: toCustomerReference(customer.id),
      fullName: `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim(),
      status: customer.status,
      customerType: customer.customerType,
      bookingCount: Array.isArray((customer as { bookings?: unknown[] }).bookings)
        ? (customer as { bookings: unknown[] }).bookings.length
        : null,
      phone: maskPhoneNumber(customer.phone, { revealForCall: this.shouldRevealPhone(context, args) }),
      email: customer.email ? `${String(customer.email).slice(0, 2)}***` : null,
      rentalClearance: (customer as { rentalClearance?: unknown }).rentalClearance ?? null,
    };
  }

  private async findBooking(
    context: VoiceMcpRequestContext,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const search = this.pickString(args, ['search', 'licensePlate']) ?? '';
    const result = await this.bookingsService.findAll(context.organizationId, {
      search: search || undefined,
      page: 1,
      limit: 5,
    } as never);

    const bookings = Array.isArray(result.data) ? result.data : [];
    if (!bookings.length) {
      throw new VoiceMcpError('DataUnavailable', 'No matching booking was found.');
    }

    return {
      matchCount: bookings.length,
      bookings: bookings.slice(0, 5).map((booking) => {
        const row = booking as Record<string, unknown>;
        const bookingId = String(row.id ?? '');
        return {
          bookingRef: toBookingReference(bookingId),
          status: row.status ?? row.statusEnum ?? null,
          customerName: row.customerName ?? null,
          vehicleLicense: row.vehicleLicense ?? null,
          pickupStationName: row.pickupStationName ?? row.station ?? null,
          startDate: row.startDate ?? null,
          endDate: row.endDate ?? null,
        };
      }),
    };
  }

  private async getBookingStatus(
    context: VoiceMcpRequestContext,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const booking = await this.resolveBooking(context, args);
    if (!booking) {
      throw new VoiceMcpError('DataUnavailable', 'No matching booking was found.');
    }

    return {
      bookingRef: toBookingReference(String(booking.id)),
      status: booking.status,
      statusEnum: booking.statusEnum ?? null,
      customerName: booking.customerName ?? null,
      vehicleName: booking.vehicleName ?? null,
      vehicleLicense: booking.vehicleLicense ?? null,
      pickupStationName: booking.pickupStationName ?? booking.station ?? null,
      returnStationName: booking.returnStationName ?? null,
      startDate: booking.startDate ?? null,
      endDate: booking.endDate ?? null,
    };
  }

  private async getVehicleStatus(
    context: VoiceMcpRequestContext,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const search = this.pickString(args, ['licensePlate', 'search']);
    if (!search?.trim()) {
      throw new VoiceMcpError('DataUnavailable', 'A license plate or vehicle search term is required.');
    }

    const vehicleId = await this.entityResolver.resolveVehicleIdByLicensePlate(
      context.organizationId,
      search.trim(),
    );
    if (!vehicleId) {
      const bookingMatches = await this.bookingsService.findAll(context.organizationId, {
        search: search.trim(),
        page: 1,
        limit: 2,
      } as never);
      const bookingRows = Array.isArray(bookingMatches.data) ? bookingMatches.data : [];
      if (bookingRows.length === 1) {
        const bookingVehicleId = String((bookingRows[0] as { vehicleId?: string }).vehicleId ?? '');
        if (bookingVehicleId) {
          const vehicle = await this.vehiclesService.findOne(context.organizationId, bookingVehicleId);
          if (vehicle) {
            return this.presentVehicleStatus(vehicle);
          }
        }
      }
      throw new VoiceMcpError('DataUnavailable', 'No matching vehicle was found.');
    }

    const vehicle = await this.vehiclesService.findOne(context.organizationId, vehicleId);
    if (!vehicle) {
      throw new VoiceMcpError('DataUnavailable', 'No matching vehicle was found.');
    }

    return this.presentVehicleStatus(vehicle);
  }

  private async getInvoiceStatus(
    context: VoiceMcpRequestContext,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const search =
      this.pickString(args, ['invoiceNumber', 'search']) ??
      (args.customerRef ? String(args.customerRef) : undefined);

    if (!search?.trim()) {
      throw new VoiceMcpError('DataUnavailable', 'An invoice number or search term is required.');
    }

    const list = await this.invoiceListReadService.list(context.organizationId, {
      search: search.trim(),
      page: 1,
      limit: 5,
    } as never);

    if (!list.data.length) {
      throw new VoiceMcpError('DataUnavailable', 'No matching invoice was found.');
    }
    if (list.data.length > 1) {
      return {
        matchCount: list.data.length,
        invoices: list.data.slice(0, 5).map((invoice) => ({
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          totalGross: invoice.totalGross,
          paidAmount: invoice.paidAmount,
          outstandingAmount: invoice.outstandingAmount,
          currency: invoice.currency,
          dueDate: invoice.dueDate,
        })),
      };
    }

    const invoice = list.data[0];
    return {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      totalGross: invoice.totalGross,
      paidAmount: invoice.paidAmount,
      outstandingAmount: invoice.outstandingAmount,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      invoiceDate: invoice.invoiceDate,
    };
  }

  private async getBranchInformation(
    context: VoiceMcpRequestContext,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const station = await this.resolveStation(context, args);
    if (!station) {
      throw new VoiceMcpError('DataUnavailable', 'No matching branch or station was found.');
    }
    return {
      name: station.name,
      code: station.code,
      type: station.typeLabel,
      status: station.statusLabel,
      address: [station.addressLine1, station.postalCode, station.city, station.country]
        .filter(Boolean)
        .join(', '),
      phone: maskPhoneNumber(station.phone, { revealForCall: false }),
      email: station.email,
      pickupEnabled: station.pickupEnabled,
      returnEnabled: station.returnEnabled,
      managerName: station.managerName,
    };
  }

  private async getBusinessHours(
    context: VoiceMcpRequestContext,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const station = await this.resolveStation(context, args, { optional: true });
    if (station) {
      return {
        source: 'station',
        stationName: station.name,
        timezone: station.timezone,
        openingHours: station.openingHours,
        currentlyOpen: null,
      };
    }

    const assistantRow = await this.prisma.voiceAssistant.findFirst({
      where: { id: context.voiceAssistantId, organizationId: context.organizationId },
    });
    if (!assistantRow) {
      throw new VoiceMcpError('DataUnavailable', 'Business hours are not available.');
    }

    const config = buildCanonicalAgentConfigFromAssistant(assistantRow);
    const profile = await this.organizationsService.getTenantProfile(context.organizationId);

    return {
      source: 'assistant',
      timezone: config.businessHours?.timezone ?? profile.timezone ?? null,
      schedule: config.businessHours?.schedule ?? null,
      defaultHours: {
        start: config.businessHours?.start ?? null,
        end: config.businessHours?.end ?? null,
      },
      currentlyOpen: isWithinBusinessHours(config.businessHours ?? null),
      afterHoursMessage: config.businessHours?.afterHoursMessage ?? null,
    };
  }

  private buildCustomerSearch(args: Record<string, unknown>, context: VoiceMcpRequestContext): string {
    return (
      this.pickString(args, ['phone', 'email', 'name']) ??
      context.callerPhoneE164 ??
      ''
    );
  }

  private shouldRevealPhone(context: VoiceMcpRequestContext, args: Record<string, unknown>): boolean {
    const argPhone = this.pickString(args, ['phone']);
    if (!argPhone || !context.callerPhoneE164) {
      return false;
    }
    const normalize = (value: string) => value.replace(/\D/g, '');
    return normalize(argPhone) === normalize(context.callerPhoneE164);
  }

  private pickString(args: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = args[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private presentVehicleStatus(vehicle: Record<string, unknown>) {
    return {
      label:
        vehicle.vehicleName ||
        `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() ||
        vehicle.licensePlate,
      licensePlate: vehicle.licensePlate ?? null,
      fleetStatus: vehicle.fleetStatus ?? vehicle.status ?? null,
      operationalState: vehicle.operationalState ?? null,
      stationName: vehicle.stationName ?? null,
      connectivity: vehicle.connectivityStatus ?? null,
    };
  }

  private async resolveCustomer(context: VoiceMcpRequestContext, args: Record<string, unknown>) {
    const customerRef = this.pickString(args, ['customerRef']);
    if (customerRef) {
      const customerId = await this.entityResolver.resolveCustomerIdByRef(
        context.organizationId,
        customerRef,
      );
      if (customerId) {
        return this.customersService.findById(context.organizationId, customerId);
      }
    }

    const search = this.buildCustomerSearch(args, context);
    if (!search) {
      return null;
    }

    const result = await this.customersService.findAll(context.organizationId, {
      search,
      page: 1,
      limit: 2,
    } as never);
    if (result.data.length !== 1) {
      return null;
    }
    const row = result.data[0] as { id: string };
    return this.customersService.findById(context.organizationId, row.id);
  }

  private async resolveBooking(context: VoiceMcpRequestContext, args: Record<string, unknown>) {
    const bookingRef = this.pickString(args, ['bookingRef']);
    if (bookingRef) {
      const bookingId = await this.entityResolver.resolveBookingIdByRef(
        context.organizationId,
        bookingRef,
      );
      if (bookingId) {
        return this.bookingsService.findById(context.organizationId, bookingId);
      }
    }

    const search = this.pickString(args, ['search']);
    if (!search) {
      return null;
    }

    const result = await this.bookingsService.findAll(context.organizationId, {
      search,
      page: 1,
      limit: 2,
    } as never);
    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length !== 1) {
      return null;
    }
    return this.bookingsService.findById(context.organizationId, String((rows[0] as { id: string }).id));
  }

  private async resolveStation(
    context: VoiceMcpRequestContext,
    args: Record<string, unknown>,
    options: { optional?: boolean } = {},
  ) {
    const stations = await this.stationsService.findAll(context.organizationId, {
      includeArchived: false,
    } as never);

    const name = this.pickString(args, ['stationName'])?.toLowerCase();
    const city = this.pickString(args, ['city'])?.toLowerCase();
    const code = this.pickString(args, ['branchCode'])?.toLowerCase();

    const matches = stations.filter((station) => {
      if (code && station.code?.toLowerCase() === code) return true;
      if (name && station.name.toLowerCase().includes(name)) return true;
      if (city && station.city?.toLowerCase().includes(city)) return true;
      return !name && !city && !code;
    });

    if (!matches.length) {
      if (options.optional) {
        return null;
      }
      throw new VoiceMcpError('CustomerNotFound', 'No matching branch or station was found.');
    }
    if (matches.length > 1 && (name || city || code)) {
      throw new VoiceMcpError('MultipleMatches', 'Multiple branches matched the provided details.', {
        matchCount: matches.length,
        candidates: matches.slice(0, 3).map((station) => ({
          name: station.name,
          city: station.city,
          code: station.code,
        })),
      });
    }

    return matches[0];
  }
}
