import * as fs from 'fs';
import * as path from 'path';
import { VehicleHealthTabSummaryService } from './vehicle-health-tab-summary.service';
import { VehicleFileSummaryService } from '../vehicle-file/vehicle-file-summary.service';
import { VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT } from '../ports/vehicle-intelligence-rental-health-read.port';

describe('VI rental health read port — consumer wiring', () => {
  it('health tab and vehicle file services do not import RentalHealthService', () => {
    const tabSrc = fs.readFileSync(path.join(__dirname, 'vehicle-health-tab-summary.service.ts'), 'utf8');
    const fileSrc = fs.readFileSync(
      path.join(__dirname, '../vehicle-file/vehicle-file-summary.service.ts'),
      'utf8',
    );
    expect(tabSrc).not.toMatch(/import.*RentalHealthService/);
    expect(fileSrc).not.toMatch(/import.*RentalHealthService/);
    expect(tabSrc).toContain('VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT');
    expect(fileSrc).toContain('VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT');
  });

  it('health tab preserves endpoint_error degradation when port throws', async () => {
    const rentalHealth = {
      getVehicleHealth: jest.fn().mockRejectedValue(new Error('upstream down')),
    };
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ dimoVehicle: null, nextTuvDate: null, nextBokraftDate: null, lastTuvDate: null, lastBokraftDate: null }),
      },
      vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const svc = new VehicleHealthTabSummaryService(
      rentalHealth as never,
      prisma as never,
      { getAiHealthCare: jest.fn().mockResolvedValue(null) } as never,
      {
        getDashboardWarningLights: jest.fn().mockResolvedValue({
          vehicleId: 'v1',
          provider: 'NONE',
          connectionStatus: 'not_connected',
          supportStatus: 'not_connected',
          freshness: 'no_data',
          overallStatus: 'unknown',
          lights: [],
        }),
      } as never,
      { evaluateCompliance: jest.fn().mockResolvedValue(null) } as never,
      { getStats: jest.fn().mockResolvedValue({ lastChecked: new Date().toISOString() }) } as never,
      { isHmHealthActive: jest.fn().mockResolvedValue(false) } as never,
    );

    const summary = await svc.getSummary('org-1', 'v1');
    expect(summary.overall.state).toBe('unknown');
    expect(summary.sourceStatus.rentalHealth).toBe('endpoint_error');
    expect(rentalHealth.getVehicleHealth).toHaveBeenCalledWith('org-1', 'v1');
  });
});

describe('VehicleFileSummaryService rental health null fallback', () => {
  it('maps null health to not_available canonical status', async () => {
    const rentalHealth = {
      getVehicleHealth: jest.fn().mockRejectedValue(new Error('unavailable')),
    };
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'v1',
          organizationId: 'org-1',
          vin: null,
          licensePlate: 'X',
          make: 'VW',
          model: 'Golf',
          year: 2020,
          mileageKm: 1000,
          fuelType: 'PETROL',
          leasingRateCents: null,
          insuranceCostCents: null,
          taxCostCents: null,
          lastTuvDate: null,
          nextTuvDate: null,
          lastBokraftDate: null,
          nextBokraftDate: null,
          batterySpecs: [],
          latestState: null,
        }),
      },
      vehicleDocumentExtraction: { findMany: jest.fn().mockResolvedValue([]) },
      vehicleInsuranceRecord: { count: jest.fn().mockResolvedValue(0) },
      vehicleServiceEvent: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    const serviceCompliance = {
      buildServiceInfoStatus: jest.fn().mockResolvedValue({
        tuvHistory: [],
        serviceHistory: [],
        bokraftHistory: [],
      }),
      evaluateCompliance: jest.fn().mockResolvedValue({
        tuvBokraft: {
          tuvOverdue: false,
          bokraftOverdue: false,
          tuvRemainingDays: null,
          bokraftRemainingDays: null,
          tuvValidTill: null,
          bokraftValidTill: null,
          tuvLastDate: null,
          bokraftLastDate: null,
        },
        nextService: {
          trackingStatus: 'NO_TRACKING',
          severity: 'OK',
          message: null,
          timeToNextServiceDays: null,
          distanceToNextServiceKm: null,
        },
      }),
    };
    const svc = new VehicleFileSummaryService(
      prisma as never,
      rentalHealth as never,
      serviceCompliance as never,
    );

    const summary = await svc.buildSummary('v1');
    expect(summary.canonicalStatus.rentalHealthStatus).toBeNull();
    expect(summary.canonicalStatus.rentalHealthSource).toBe('not_available');
    expect(rentalHealth.getVehicleHealth).toHaveBeenCalledWith('org-1', 'v1');
  });
});