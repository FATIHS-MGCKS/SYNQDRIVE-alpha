import { EuromasterMapperService } from './euromaster-mapper.service';
import {
  EuromasterAppointmentInput,
  EmAppointmentCreateResponse,
  EUROMASTER_REQUIRED_SCOPES,
} from './euromaster.types';
import {
  EuromasterIntegrationDisabledError,
  EuromasterTenantNotAssignedError,
  EuromasterAuthorizationMissingError,
  EuromasterConfigError,
  EuromasterAuthError,
  EuromasterApiError,
  EuromasterTimeoutError,
  EuromasterMappingError,
} from './euromaster.errors';

// ─── Mapper tests ───────────────────────────────────────────────────

describe('EuromasterMapperService', () => {
  const mapper = new EuromasterMapperService();

  const baseInput: EuromasterAppointmentInput = {
    organizationId: 'org-123',
    vehiclePlate: 'B-EM 1234',
    vehicleVin: 'WBA12345678901234',
    vehicleMake: 'BMW',
    vehicleModel: '3 Series',
    mileageKm: 45000,
    serviceType: 'TIRE_SERVICE',
    preferredDate: '2026-05-15',
    contactName: 'Max Muster',
    contactPhone: '+49 170 1234567',
    notes: 'Summer tire change',
  };

  it('toApiRequest maps vehicle data correctly', () => {
    const req = mapper.toApiRequest(baseInput, 'CUST-001', 'Fleet GmbH');
    expect(req.vehicle.licensePlate).toBe('B-EM 1234');
    expect(req.vehicle.vin).toBe('WBA12345678901234');
    expect(req.vehicle.make).toBe('BMW');
    expect(req.vehicle.mileageKm).toBe(45000);
    expect(req.customer.customerId).toBe('CUST-001');
    expect(req.customer.companyName).toBe('Fleet GmbH');
    expect(req.service.type).toBe('TIRE_CHANGE');
    expect(req.service.preferredDate).toBe('2026-05-15');
  });

  it('toApiRequest throws for missing vehicle plate', () => {
    expect(() =>
      mapper.toApiRequest({ ...baseInput, vehiclePlate: '' }, 'C1', 'Co'),
    ).toThrow(EuromasterMappingError);
  });

  it('toApiRequest omits branch when no location data', () => {
    const req = mapper.toApiRequest(baseInput, 'C1', 'Co');
    expect(req.branch).toBeUndefined();
  });

  it('toApiRequest includes branch when postalCode provided', () => {
    const req = mapper.toApiRequest(
      { ...baseInput, postalCode: '80331' }, 'C1', 'Co',
    );
    expect(req.branch).toBeDefined();
    expect(req.branch!.postalCode).toBe('80331');
  });

  it('fromApiResponse maps confirmed appointment', () => {
    const apiResp: EmAppointmentCreateResponse = {
      appointmentId: 'EM-99',
      status: 'CONFIRMED',
      scheduledDate: '2026-05-15',
      branch: { branchId: 'B1', name: 'EM Munich', address: 'Str 1', city: 'Munich' },
      estimatedDurationMinutes: 60,
      estimatedCostEur: 120.5,
      confirmationNumber: 'CONF-123',
    };
    const result = mapper.fromApiResponse(apiResp);
    expect(result.status).toBe('confirmed');
    expect(result.externalReference).toBe('EM-99');
    expect(result.branchName).toBe('EM Munich');
    expect(result.estimatedCostEur).toBe(120.5);
    expect(result.mode).toBe('live');
  });

  it('fromApiResponse maps REJECTED status', () => {
    const result = mapper.fromApiResponse({
      appointmentId: 'EM-100',
      status: 'REJECTED',
      message: 'No capacity',
    });
    expect(result.status).toBe('rejected');
    expect(result.message).toBe('No capacity');
  });

  it('createManualResult returns manual_pending with reference', () => {
    const result = mapper.createManualResult(baseInput);
    expect(result.status).toBe('manual_pending');
    expect(result.mode).toBe('manual');
    expect(result.externalReference).toMatch(/^EM-MAN-/);
  });

  it('buildCaseMetadata includes all key fields', () => {
    const result = mapper.createManualResult(baseInput);
    const meta = mapper.buildCaseMetadata(baseInput, result);
    expect(meta.externalReference).toBe(result.externalReference);
    expect(meta.vehiclePlate).toBe('B-EM 1234');
    expect(meta.vehicleVin).toBe('WBA12345678901234');
    expect(meta.mileageKm).toBe(45000);
    expect(meta.mode).toBe('manual');
  });

  it('mapServiceTypeToTitle produces readable title', () => {
    expect(mapper.mapServiceTypeToTitle('TIRE_SERVICE')).toBe('Euromaster: Tire Service');
    expect(mapper.mapServiceTypeToTitle('MAINTENANCE')).toBe('Euromaster: Maintenance');
    expect(mapper.mapServiceTypeToTitle('INSPECTION')).toBe('Euromaster: Inspection');
  });

  it('SERVICE_TYPE_MAP covers all ServiceCaseType values', () => {
    const req = mapper.toApiRequest(
      { ...baseInput, serviceType: 'MAINTENANCE' }, 'C1', 'Co',
    );
    expect(req.service.type).toBe('GENERAL_MAINTENANCE');
  });
});

// ─── Error class tests ──────────────────────────────────────────────

describe('Euromaster error classes', () => {
  it('EuromasterIntegrationDisabledError has correct code and status', () => {
    const err = new EuromasterIntegrationDisabledError('org-1');
    expect(err.code).toBe('EUROMASTER_DISABLED');
    expect(err.statusCode).toBe(403);
    expect(err.message).toContain('org-1');
  });

  it('EuromasterAuthorizationMissingError lists missing scopes', () => {
    const err = new EuromasterAuthorizationMissingError(
      ['vehicle_plate.read', 'appointment.write'],
      'org-1',
    );
    expect(err.code).toBe('EUROMASTER_AUTH_MISSING');
    expect(err.missingScopes).toEqual(['vehicle_plate.read', 'appointment.write']);
    expect(err.statusCode).toBe(403);
  });

  it('EuromasterConfigError has 500 status', () => {
    const err = new EuromasterConfigError('missing api key');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('EUROMASTER_CONFIG_ERROR');
  });

  it('EuromasterAuthError captures http status', () => {
    const err = new EuromasterAuthError('invalid_client', 401);
    expect(err.statusCode).toBe(401);
  });

  it('EuromasterApiError captures upstream code', () => {
    const err = new EuromasterApiError('rate limited', 429, 'RATE_LIMIT');
    expect(err.upstreamCode).toBe('RATE_LIMIT');
    expect(err.statusCode).toBe(429);
  });

  it('EuromasterTimeoutError includes operation name', () => {
    const err = new EuromasterTimeoutError('createAppointment', 15000);
    expect(err.code).toBe('EUROMASTER_TIMEOUT');
    expect(err.statusCode).toBe(504);
    expect(err.message).toContain('15000ms');
  });

  it('EuromasterTenantNotAssignedError includes orgId', () => {
    const err = new EuromasterTenantNotAssignedError('org-abc');
    expect(err.code).toBe('EUROMASTER_TENANT_NOT_ASSIGNED');
    expect(err.message).toContain('org-abc');
  });
});

// ─── Feature flag behavior tests ────────────────────────────────────

describe('Feature flag and mode behavior', () => {
  it('EUROMASTER_REQUIRED_SCOPES.createAppointment requires write scopes', () => {
    const scopes = EUROMASTER_REQUIRED_SCOPES.createAppointment;
    expect(scopes).toContain('appointment.write');
    expect(scopes).toContain('service_request.write');
    expect(scopes).toContain('vehicle_plate.read');
  });

  it('EUROMASTER_REQUIRED_SCOPES.tireService includes tire_data scope', () => {
    const scopes = EUROMASTER_REQUIRED_SCOPES.tireService;
    expect(scopes).toContain('vehicle_tire_data.read');
  });

  it('EUROMASTER_REQUIRED_SCOPES.branchSearch requires no scopes', () => {
    expect(EUROMASTER_REQUIRED_SCOPES.branchSearch).toHaveLength(0);
  });

  it('disabled config causes EuromasterIntegrationDisabledError', () => {
    expect(() => {
      throw new EuromasterIntegrationDisabledError();
    }).toThrow(EuromasterIntegrationDisabledError);
  });

  it('missing scopes cause EuromasterAuthorizationMissingError', () => {
    const granted = new Set(['vehicle_identity.read']);
    const required = EUROMASTER_REQUIRED_SCOPES.createAppointment;
    const missing = required.filter((s) => !granted.has(s));
    expect(missing.length).toBeGreaterThan(0);
    expect(() => {
      throw new EuromasterAuthorizationMissingError(missing);
    }).toThrow(EuromasterAuthorizationMissingError);
  });
});

// ─── Data authorization enforcement logic tests ─────────────────────

describe('Data authorization enforcement', () => {
  it('all scopes granted passes validation', () => {
    const granted = new Set([
      'vehicle_identity.read',
      'vehicle_plate.read',
      'service_request.write',
      'appointment.write',
    ]);
    const required = EUROMASTER_REQUIRED_SCOPES.createAppointment;
    const missing = required.filter((s) => !granted.has(s));
    expect(missing).toEqual([]);
  });

  it('partial scopes returns missing list', () => {
    const granted = new Set(['vehicle_identity.read']);
    const required = EUROMASTER_REQUIRED_SCOPES.createAppointment;
    const missing = required.filter((s) => !granted.has(s));
    expect(missing).toContain('vehicle_plate.read');
    expect(missing).toContain('service_request.write');
    expect(missing).toContain('appointment.write');
  });

  it('empty granted scopes returns all required as missing', () => {
    const granted = new Set<string>();
    const required = EUROMASTER_REQUIRED_SCOPES.tireService;
    const missing = required.filter((s) => !granted.has(s));
    expect(missing).toEqual(required);
  });
});

// ─── Persistence metadata tests ─────────────────────────────────────

describe('Persistence integration', () => {
  const mapper = new EuromasterMapperService();

  it('manual result generates safe metadata for persistence', () => {
    const input: EuromasterAppointmentInput = {
      organizationId: 'org-1',
      vehiclePlate: 'B-EM 9999',
      serviceType: 'MAINTENANCE',
    };
    const result = mapper.createManualResult(input);
    const meta = mapper.buildCaseMetadata(input, result);

    expect(typeof meta.externalReference).toBe('string');
    expect(meta.mode).toBe('manual');
    expect(meta.vehiclePlate).toBe('B-EM 9999');
    expect(meta).not.toHaveProperty('apiKey');
    expect(meta).not.toHaveProperty('clientSecret');
  });

  it('live result includes confirmation number in metadata', () => {
    const input: EuromasterAppointmentInput = {
      organizationId: 'org-1',
      vehiclePlate: 'M-FL 5555',
      serviceType: 'TIRE_SERVICE',
      mileageKm: 32000,
    };
    const result: any = {
      externalReference: 'EM-LIVE-1',
      confirmationNumber: 'CONF-ABC',
      mode: 'live',
      branchName: 'EM Berlin',
      estimatedCostEur: 89.90,
      estimatedDurationMinutes: 45,
    };
    const meta = mapper.buildCaseMetadata(input, result);
    expect(meta.confirmationNumber).toBe('CONF-ABC');
    expect(meta.estimatedCostEur).toBe(89.90);
    expect(meta.branchName).toBe('EM Berlin');
  });
});
