import { BadRequestException } from '@nestjs/common';
import { BrakeRegistrationService } from './brake-registration.service';
import { BrakeInitializationWorkflowService } from './brake-initialization-workflow.service';

const store = {
  vehicles: new Map<string, { id: string; organizationId: string; make?: string; model?: string; modelYear?: number; powertrain?: string }>(),
  specs: [] as any[],
  bhc: new Map<string, any>(),
};

const mockPrisma = {
  vehicle: {
    findFirst: jest.fn(async ({ where }: any) => {
      const row = store.vehicles.get(where.id);
      if (!row || row.organizationId !== where.organizationId) return null;
      return row;
    }),
  },
  brakeHealthCurrent: {
    findUnique: jest.fn(async ({ where }: any) => store.bhc.get(where.vehicleId) ?? null),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const existing = store.bhc.get(where.vehicleId);
      const row = existing ? { ...existing, ...update } : create;
      store.bhc.set(where.vehicleId, row);
      return row;
    }),
  },
} as any;

const mockWorkflow = {
  initializeFromRegistration: jest.fn(),
} as any;

const mockReferenceSpec = {
  createForVehicle: jest.fn(async (vehicleId: string, input: any) => {
    const row = { id: `spec-${store.specs.length + 1}`, vehicleId, ...input };
    store.specs.push(row);
    return { spec: row, warnings: [] };
  }),
} as any;

const svc = new BrakeRegistrationService(
  mockPrisma,
  mockWorkflow as BrakeInitializationWorkflowService,
  mockReferenceSpec,
);

describe('BrakeRegistrationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    store.vehicles.clear();
    store.specs.length = 0;
    store.bhc.clear();
    store.vehicles.set('veh-1', {
      id: 'veh-1',
      organizationId: 'org-1',
      make: 'VW',
      model: 'ID.4',
      modelYear: 2024,
      powertrain: 'EV',
    });
  });

  const baseInput = {
    vehicleId: 'veh-1',
    organizationId: 'org-1',
    registrationMileageKm: 1200,
    latestStateOdometerKm: 1200,
  };

  it('documented new brakes materialize DOCUMENTED_REPLACEMENT without measured evidence', async () => {
    mockWorkflow.initializeFromRegistration.mockResolvedValue({
      outcome: 'initialized',
      initialized: true,
      skipped: false,
      message: 'ok',
    });
    store.bhc.set('veh-1', {
      isInitialized: true,
      anchorValidationStatus: 'spec_fallback_anchor',
    });

    const result = await svc.processRegistrationBrakes({
      ...baseInput,
      brakes: { condition: 'NEW' },
    });

    expect(result.brakeHealthInitialized).toBe(true);
    expect(result.brakeBaselineStatus).toBe('DOCUMENTED_REPLACEMENT');
    expect(result.evidenceSource).toBe('DOCUMENTED_REPLACEMENT');
    expect(result.requiresMeasurement).toBe(true);
    expect(store.specs).toHaveLength(1);
  });

  it('measured new brakes materialize MEASURED baseline', async () => {
    mockWorkflow.initializeFromRegistration.mockResolvedValue({
      outcome: 'initialized',
      initialized: true,
      skipped: false,
      message: 'ok',
    });
    store.bhc.set('veh-1', {
      isInitialized: true,
      anchorValidationStatus: 'measured_anchor',
    });

    const result = await svc.processRegistrationBrakes({
      ...baseInput,
      brakes: {
        condition: 'NEW',
        frontPadThickness: 10.5,
        rearPadThickness: 10.2,
      },
    });

    expect(result.brakeBaselineStatus).toBe('MEASURED');
    expect(result.evidenceSource).toBe('MEASURED');
    expect(result.requiresMeasurement).toBe(false);
  });

  it('unknown brakes without payload stays NO_BASELINE when no spec values', async () => {
    const result = await svc.processRegistrationBrakes({
      ...baseInput,
      brakes: { condition: 'UNKNOWN' },
    });

    expect(result.brakeBaselineStatus).toBe('NO_BASELINE');
    expect(result.brakeHealthInitialized).toBe(false);
    expect(mockWorkflow.initializeFromRegistration).not.toHaveBeenCalled();
  });

  it('spec-only without odometer returns INITIALIZATION_REQUIRED and persists marker', async () => {
    mockWorkflow.initializeFromRegistration.mockResolvedValue({
      outcome: 'skipped_no_odometer',
      initialized: false,
      skipped: true,
      message: 'Brake baseline initialization requires an odometer anchor.',
    });

    const result = await svc.processRegistrationBrakes({
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      brakes: { condition: 'USED', frontPadThickness: 8.5 },
      registrationMileageKm: null,
      latestStateOdometerKm: null,
    });

    expect(result.brakeBaselineStatus).toBe('INITIALIZATION_REQUIRED');
    expect(result.brakeHealthInitialized).toBe(false);
    expect(store.bhc.get('veh-1')?.isInitialized).toBe(false);
    expect(store.bhc.get('veh-1')?.baselineWarnings?.[0]).toMatch(/initialization required/i);
  });

  it('rejects implausible thickness values before writing spec', async () => {
    const result = await svc.processRegistrationBrakes({
      ...baseInput,
      brakes: { frontPadThickness: 99 },
    });

    expect(result.brakeBaselineStatus).toBe('FAILED');
    expect(result.initializationError).toMatch(/plausible maximum/i);
    expect(store.specs).toHaveLength(0);
    expect(mockWorkflow.initializeFromRegistration).not.toHaveBeenCalled();
  });

  it('duplicate registration call is idempotent via workflow skip', async () => {
    mockWorkflow.initializeFromRegistration.mockResolvedValue({
      outcome: 'already_initialized',
      initialized: false,
      skipped: true,
      message: 'already initialized',
    });
    store.bhc.set('veh-1', {
      isInitialized: true,
      anchorValidationStatus: 'measured_anchor',
    });

    const result = await svc.processRegistrationBrakes({
      ...baseInput,
      brakes: { condition: 'NEW', frontPadThickness: 10.5 },
    });

    expect(result.brakeHealthInitialized).toBe(true);
    expect(result.brakeBaselineStatus).toBe('MEASURED');
  });

  it('partial failure marks FAILED and persists initialization marker', async () => {
    mockWorkflow.initializeFromRegistration.mockResolvedValue({
      outcome: 'failed',
      initialized: false,
      skipped: false,
      message: 'Brake baseline initialization failed: db unavailable',
    });

    const result = await svc.processRegistrationBrakes({
      ...baseInput,
      brakes: { condition: 'NEW' },
    });

    expect(result.brakeBaselineStatus).toBe('FAILED');
    expect(result.initializationError).toMatch(/db unavailable/i);
    expect(store.bhc.get('veh-1')?.baselineWarnings?.[0]).toMatch(/initialization required/i);
  });

  it('rejects cross-tenant vehicle access', async () => {
    await expect(
      svc.processRegistrationBrakes({
        vehicleId: 'veh-1',
        organizationId: 'org-other',
        brakes: { condition: 'NEW' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
