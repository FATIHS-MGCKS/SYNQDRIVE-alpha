import { MembershipRole } from '@prisma/client';
import { buildAiExecutionContext } from '../execution/ai-execution-context.builder';
import type { VerifiedAiExecutionContextInput } from '../execution/ai-execution-context.types';
import type { AiExecutionContext } from '../execution/ai-execution-context.types';
import { AiGetVehicleLocationTool } from '../tools/get-vehicle-location/ai-get-vehicle-location.tool';
import { AiGetVehicleTelemetryStatusTool } from '../tools/get-vehicle-telemetry-status/ai-get-vehicle-telemetry-status.tool';
import { AiGetVehicleHealthSummaryTool } from '../tools/get-vehicle-health-summary/ai-get-vehicle-health-summary.tool';
import { AiExplainOverdueReturnTool } from '../tools/explain-overdue-return/ai-explain-overdue-return.tool';
import { AiGetVehicleBookingContextTool } from '../tools/get-vehicle-booking-context/ai-get-vehicle-booking-context.tool';
import { AI_DOMAIN_TOOL_DEFINITIONS } from './ai-domain-tool-registry.definitions';
import {
  createAiDomainToolInvocationTracker,
  type AiDomainToolInvocationTracker,
} from './ai-domain-tool-registry.types';
import { AiDomainToolRegistry } from './ai-domain-tool-registry.service';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '99999999-9999-4999-8999-999999999999';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';

function baseVerifiedInput(
  overrides: Partial<VerifiedAiExecutionContextInput> = {},
): VerifiedAiExecutionContextInput {
  return {
    organizationId: ORG_ID,
    userId: USER_ID,
    membershipRole: MembershipRole.WORKER,
    membershipStatus: 'ACTIVE',
    permissions: {
      fleet: { read: true, write: false },
      'fleet-condition': { read: true, write: false },
      bookings: { read: true, write: false },
      customers: { read: true, write: false },
      dashboard: { read: true, write: false },
      'ai-assistant': { read: true, write: false },
    },
    stationScope: 'ALL',
    stationIds: [],
    channel: 'fleet_chat',
    dataAccessPurpose: 'fleet_assistant_query',
    correlationId: 'corr-registry-001',
    requestId: 'req-registry-001',
    ...overrides,
  };
}

function buildContext(
  overrides: Partial<VerifiedAiExecutionContextInput> = {},
): AiExecutionContext {
  return buildAiExecutionContext(baseVerifiedInput(overrides));
}

function createRegistry(
  _locationTool?: Partial<AiGetVehicleLocationTool>,
): AiDomainToolRegistry {
  return createRegistryWithMocks({}).registry;
}

function createRegistryWithMocks(input: {
  locationExecute?: jest.Mock;
  telemetryExecute?: jest.Mock;
  healthExecute?: jest.Mock;
  overdueExecute?: jest.Mock;
  bookingExecute?: jest.Mock;
}): {
  registry: AiDomainToolRegistry;
  locationTool: { execute: jest.Mock };
  telemetryTool: { execute: jest.Mock };
  healthTool: { execute: jest.Mock };
  overdueTool: { execute: jest.Mock };
  bookingTool: { execute: jest.Mock };
} {
  const locationTool = { execute: jest.fn(input.locationExecute) };
  const telemetryTool = { execute: jest.fn(input.telemetryExecute) };
  const healthTool = { execute: jest.fn(input.healthExecute) };
  const overdueTool = { execute: jest.fn(input.overdueExecute) };
  const bookingTool = { execute: jest.fn(input.bookingExecute) };

  const registry = new AiDomainToolRegistry(
    locationTool as unknown as AiGetVehicleLocationTool,
    telemetryTool as unknown as AiGetVehicleTelemetryStatusTool,
    healthTool as unknown as AiGetVehicleHealthSummaryTool,
    overdueTool as unknown as AiExplainOverdueReturnTool,
    bookingTool as unknown as AiGetVehicleBookingContextTool,
  );

  return {
    registry,
    locationTool,
    telemetryTool,
    healthTool,
    overdueTool,
    bookingTool,
  };
}

describe('AiDomainToolRegistry', () => {
  it('lists all five registered domain tools with required metadata', () => {
    const registry = createRegistry();
    const tools = registry.listRegisteredTools();

    expect(tools).toHaveLength(5);
    expect(tools.map((entry) => entry.name)).toEqual([
      'get_vehicle_location',
      'get_vehicle_telemetry_status',
      'get_vehicle_health_summary',
      'explain_overdue_return',
      'get_vehicle_booking_context',
    ]);

    for (const definition of tools) {
      expect(definition.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(definition.description.length).toBeGreaterThan(10);
      expect(definition.inputSchema.fields.length).toBeGreaterThan(0);
      expect(definition.outputSchema.fields.length).toBeGreaterThan(0);
      expect(definition.requiredPermissions.length).toBeGreaterThan(0);
      expect(definition.timeoutMs).toBeGreaterThan(0);
      expect(definition.maxInvocationsPerRequest).toBeGreaterThan(0);
      expect(definition.allowedChannels.length).toBeGreaterThan(0);
    }
  });

  it('allows preflight for a registered tool with full permissions', () => {
    const registry = createRegistry();
    const ctx = buildContext();

    const result = registry.preflight(ctx, 'get_vehicle_telemetry_status');

    expect(result.allowed).toBe(true);
    expect(result.toolName).toBe('get_vehicle_telemetry_status');
    expect(result.errors).toHaveLength(0);
  });

  it('denies unknown tool names', async () => {
    const registry = createRegistry();
    const ctx = buildContext();

    const preflight = registry.preflight(ctx, 'not_a_real_tool');
    expect(preflight.allowed).toBe(false);
    expect(preflight.toolName).toBeNull();
    expect(preflight.errors[0]?.code).toBe('invalid_input');

    const outcome = await registry.executeRegisteredTool({
      context: ctx,
      toolName: 'not_a_real_tool',
      rawInput: { vehicleId: VEHICLE_ID },
    });
    expect(outcome.data).toBeNull();
    expect(outcome.errors[0]?.code).toBe('invalid_input');
    expect(outcome.allowLlmInference).toBe(false);
  });

  it('rejects invalid input against the registered schema', async () => {
    const registry = createRegistry();
    const ctx = buildContext();

    const outcome = await registry.executeRegisteredTool({
      context: ctx,
      toolName: 'get_vehicle_telemetry_status',
      rawInput: { vehicleId: 'not-a-uuid' },
    });

    expect(outcome.data).toBeNull();
    expect(outcome.errors[0]?.code).toBe('invalid_input');
  });

  it('denies when required module permission is missing', async () => {
    const registry = createRegistry();
    const ctx = buildContext({
      permissions: {
        fleet: { read: true, write: false },
        'ai-assistant': { read: true, write: false },
      },
    });

    const preflight = registry.preflight(ctx, 'get_vehicle_health_summary');
    expect(preflight.allowed).toBe(false);
    expect(preflight.errors.some((e) => e.code === 'permission_denied')).toBe(true);

    const outcome = await registry.executeRegisteredTool({
      context: ctx,
      toolName: 'get_vehicle_health_summary',
      rawInput: { vehicleId: VEHICLE_ID },
    });
    expect(outcome.errors[0]?.code).toBe('permission_denied');
  });

  it('enforces central timeout on tool execution', async () => {
    const slowExecute = () =>
      new Promise<never>(() => {
        /* never resolves */
      });

    const { registry } = createRegistryWithMocks({
      telemetryExecute: jest.fn(slowExecute),
    });

    const ctx = buildContext();
    const outcome = await registry.executeRegisteredTool({
      context: ctx,
      toolName: 'get_vehicle_telemetry_status',
      rawInput: { vehicleId: VEHICLE_ID },
      options: { timeoutOverrideMs: 25 },
    });

    expect(outcome.data).toBeNull();
    expect(outcome.errors[0]?.code).toBe('timeout');
    expect(outcome.allowLlmInference).toBe(false);
  });

  it('denies when channel is not allowed for the tool', () => {
    const registry = createRegistry();
    const ctx = buildContext({ channel: 'whatsapp' });

    const preflight = registry.preflight(ctx, 'get_vehicle_health_summary');
    expect(preflight.allowed).toBe(false);
    expect(preflight.errors.some((e) => e.code === 'role_restricted')).toBe(true);
  });

  it('denies sensitive location tool without fleet read permission', () => {
    const registry = createRegistry();
    const ctx = buildContext({
      permissions: {
        'ai-assistant': { read: true, write: false },
        fleet: { read: false, write: false },
      },
    });

    const preflight = registry.preflight(ctx, 'get_vehicle_location');
    expect(preflight.allowed).toBe(false);
    expect(preflight.errors.some((e) => e.code === 'permission_denied')).toBe(true);
  });

  it('denies foreign organization via execution context mismatch in vehicle tool', async () => {
    const { registry } = createRegistryWithMocks({
      telemetryExecute: jest.fn(async () => ({
        tenantId: OTHER_ORG_ID,
        partial: false,
        data: null,
        evidence: [],
        errors: [
          {
            code: 'vehicle_not_found',
            publicMessage: 'Vehicle not found',
            severity: 'error',
            retryPolicy: 'non_retryable',
            httpStatus: 404,
            auditEvent: 'ai.domain_query.vehicle_not_found',
            maskEntityExistence: false,
            blockLlmInference: true,
            diagnostics: { organizationId: OTHER_ORG_ID },
          },
        ],
        warnings: [],
        allowLlmInference: false,
      })),
    });

    const ctx = buildContext({ organizationId: OTHER_ORG_ID });
    const outcome = await registry.executeRegisteredTool({
      context: ctx,
      toolName: 'get_vehicle_telemetry_status',
      rawInput: { vehicleId: VEHICLE_ID },
    });

    expect(outcome.data).toBeNull();
    expect(outcome.errors[0]?.code).toBe('vehicle_not_found');
  });

  it('enforces maximum invocations per request', async () => {
    const successOutcome = {
      tenantId: ORG_ID,
      partial: false,
      data: { vehicleId: VEHICLE_ID },
      evidence: [],
      errors: [],
      warnings: [],
      allowLlmInference: true,
    };

    const { registry } = createRegistryWithMocks({
      telemetryExecute: jest.fn(async () => successOutcome),
    });

    const tracker: AiDomainToolInvocationTracker = createAiDomainToolInvocationTracker();
    const definition = AI_DOMAIN_TOOL_DEFINITIONS.find(
      (entry) => entry.name === 'get_vehicle_telemetry_status',
    )!;
    tracker.counts.set('get_vehicle_telemetry_status', definition.maxInvocationsPerRequest);

    const ctx = buildContext();
    const outcome = await registry.executeRegisteredTool({
      context: ctx,
      toolName: 'get_vehicle_telemetry_status',
      rawInput: { vehicleId: VEHICLE_ID },
      options: { invocationTracker: tracker },
    });

    expect(outcome.errors[0]?.code).toBe('invalid_input');
    expect(outcome.errors[0]?.diagnostics.causeCode).toBe('AI_DOMAIN_TOOL_INVOCATION_LIMIT');
  });

  it('executes registered tool and returns LLM-safe outcome projection', async () => {
    const { registry } = createRegistryWithMocks({
      telemetryExecute: jest.fn(async () => ({
        tenantId: ORG_ID,
        partial: false,
        data: {
          vehicleId: VEHICLE_ID,
          telemetryState: 'live',
          displayName: 'VW Golf',
          licensePlate: 'B-XY 123',
        },
        evidence: [],
        errors: [],
        warnings: [],
        allowLlmInference: true,
      })),
    });

    const ctx = buildContext();
    const outcome = await registry.executeRegisteredTool({
      context: ctx,
      toolName: 'get_vehicle_telemetry_status',
      rawInput: { vehicleId: VEHICLE_ID },
    });

    expect(outcome.data).toEqual({
      vehicleId: VEHICLE_ID,
      telemetryState: 'live',
      displayName: 'VW Golf',
      licensePlate: 'B-XY 123',
    });
    expect(outcome.allowLlmInference).toBe(true);

    const llmView = registry.toLlmOutcome(outcome);
    expect(JSON.stringify(llmView)).not.toContain('prisma');
    expect(JSON.stringify(llmView)).not.toContain('internalDetail');
    expect(JSON.stringify(llmView.errors)).not.toContain('diagnostics');
  });
});
