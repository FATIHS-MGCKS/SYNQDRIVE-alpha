import { BrakeEvidenceService } from './brake-evidence.service';

type CreatedRow = Record<string, unknown>;

function makeService() {
  const created: CreatedRow[] = [];
  const mockPrisma = {
    brakeEvidence: {
      create: jest.fn(async ({ data }: { data: CreatedRow }) => {
        created.push(data);
        return { id: 'ev1', ...data };
      }),
      createMany: jest.fn(async ({ data }: { data: CreatedRow[] }) => {
        created.push(...data);
        return { count: data.length };
      }),
    },
  } as any;
  const svc = new BrakeEvidenceService(mockPrisma);
  return { svc, mockPrisma, created };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TELEMETRY NEVER INVENTS WHEEL MM (spec §3)
// ═══════════════════════════════════════════════════════════════════════════════

describe('BrakeEvidenceService — mm trust rule', () => {
  it('strips mm from a TELEMATICS_ESTIMATION (telemetry never carries real mm)', async () => {
    const { svc } = makeService();
    // mm-only telemetry has no other signal → not worth persisting at all.
    const row = await svc.record({
      vehicleId: 'v1',
      source: 'TELEMATICS_ESTIMATION' as any,
      axle: 'FRONT' as any,
      measuredPadMm: 5.5,
    });
    expect(row).toBeNull();
  });

  it('keeps a TELEMATICS_ESTIMATION signal but without any mm', async () => {
    const { svc, mockPrisma } = makeService();
    await svc.record({
      vehicleId: 'v1',
      source: 'TELEMATICS_ESTIMATION' as any,
      axle: 'FRONT' as any,
      measuredPadMm: 5.5,
      dtcSeverity: 'WARNING',
    });
    const data = mockPrisma.brakeEvidence.create.mock.calls.at(-1)?.[0]?.data;
    expect(data.measuredPadMm).toBeNull();
    expect(data.dtcSeverity).toBe('WARNING');
  });

  it('persists real mm from a trusted MANUAL_MEASUREMENT', async () => {
    const { svc, mockPrisma } = makeService();
    await svc.record({
      vehicleId: 'v1',
      source: 'MANUAL_MEASUREMENT' as any,
      axle: 'FRONT' as any,
      measuredPadMm: 5.5,
      confidence: 'HIGH' as any,
    });
    const data = mockPrisma.brakeEvidence.create.mock.calls.at(-1)?.[0]?.data;
    expect(data.measuredPadMm).toBe(5.5);
  });

  it('persists real mm from a confirmed AI_UPLOAD document', async () => {
    const { svc, mockPrisma } = makeService();
    await svc.record({
      vehicleId: 'v1',
      source: 'AI_UPLOAD' as any,
      axle: 'REAR' as any,
      measuredPadMm: 3.2,
      confidence: 'HIGH' as any,
    });
    const data = mockPrisma.brakeEvidence.create.mock.calls.at(-1)?.[0]?.data;
    expect(data.measuredPadMm).toBe(3.2);
  });

  it('drops rows that carry no meaningful signal', async () => {
    const { svc } = makeService();
    const row = await svc.record({
      vehicleId: 'v1',
      source: 'WORKSHOP_REPORT' as any,
      axle: 'FRONT' as any,
    });
    expect(row).toBeNull();
  });

  it('recordMany skips no-signal rows and keeps signal-bearing rows', async () => {
    const { svc } = makeService();
    const res = await svc.recordMany([
      { vehicleId: 'v1', source: 'AI_UPLOAD' as any, axle: 'FRONT' as any, measuredPadMm: 4 },
      { vehicleId: 'v1', source: 'AI_UPLOAD' as any, axle: 'REAR' as any }, // no signal
    ]);
    expect(res.count).toBe(1);
  });
});
