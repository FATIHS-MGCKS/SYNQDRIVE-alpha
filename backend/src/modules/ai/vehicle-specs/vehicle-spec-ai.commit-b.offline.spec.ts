/**
 * Commit B / Mistral strict-schema offline preflight (synthetic fixtures only — no live Mistral).
 * Exercises parse → normalize → variant gate → plausibility on current contracts.
 */
import { buildVehicleSpecJsonSchema, parseVehicleSpecJson, VEHICLE_SPEC_FIELD_KEYS } from './vehicle-spec-ai.schema.util';
import { postProcessVehicleSpecOutput } from './vehicle-spec-ai.postprocess.util';
import { VehicleSpecAiService } from './vehicle-spec-ai.service';
import type { VehicleSpecContext } from './vehicle-spec-ai.types';

function pipeline(
  raw: Record<string, unknown>,
  context?: VehicleSpecContext,
): ReturnType<typeof postProcessVehicleSpecOutput> {
  const parsed = parseVehicleSpecJson(raw as Record<string, string | number | boolean | null>);
  return postProcessVehicleSpecOutput(parsed, context);
}

const teslaContext: VehicleSpecContext = {
  make: 'Tesla',
  model: 'Model 3',
  year: 2023,
};

describe('Commit B — vehicle spec strict-schema offline preflight', () => {
  describe('schema contract (Mistral request shape)', () => {
    it('uses additionalProperties:false and nullable anyOf leaves', () => {
      const schema = buildVehicleSpecJsonSchema() as {
        additionalProperties: boolean;
        properties: Record<string, { anyOf?: unknown[] }>;
      };
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties.hvBatteryPresent?.anyOf).toEqual([
        { type: 'boolean' },
        { type: 'null' },
      ]);
      expect(schema.properties.electrificationLevel?.anyOf?.[0]).toMatchObject({
        type: 'string',
        enum: expect.arrayContaining(['BEV', 'MHEV_48V']),
      });
      expect(schema.properties.drivetrain?.anyOf?.[0]).toMatchObject({
        enum: expect.arrayContaining(['RWD', 'FOUR_WD']),
      });
      expect(schema.properties).toHaveProperty('resolvedVariant');
      expect(schema.properties).toHaveProperty('variantConfidence');
      expect(schema.properties).toHaveProperty('ambiguousVariants');
      expect(schema.properties).toHaveProperty('sourceNote');
      expect(VEHICLE_SPEC_FIELD_KEYS).toContain('sourceNote');
    });

    it('does not include nested resolvedVariant or processingNotes', () => {
      const schema = buildVehicleSpecJsonSchema() as { properties: Record<string, unknown> };
      expect(schema.properties).not.toHaveProperty('processingNotes');
      const resolved = schema.properties.resolvedVariant as { anyOf?: Array<{ type?: string }> };
      const nonNull = resolved?.anyOf?.find((b) => b.type === 'string');
      expect(nonNull).toBeDefined();
    });
  });

  describe('A — Tesla Model 3 RWD 2023 (unambiguous BEV)', () => {
    const raw = {
      resolvedVariant: 'Model 3 RWD',
      variantConfidence: 0.92,
      ambiguousVariants: [],
      electrificationLevel: 'BEV',
      drivetrain: 'RWD',
      hvBatteryPresent: true,
      hvBatteryUsableCapacityKwh: 60,
      systemMotorPowerKw: 208,
      accel0To100S: 6.1,
      curbWeightKg: 1847,
      variantAssumption: null,
    };

    it('preserves types and variant identity after postprocess', () => {
      const { specs, rejectedFields } = pipeline(raw, teslaContext);
      expect(rejectedFields.filter((r) => r.startsWith('variant_gate'))).toHaveLength(0);
      expect(specs.electrificationLevel).toBe('BEV');
      expect(specs.drivetrain).toBe('RWD');
      expect(specs.hvBatteryPresent).toBe(true);
      expect(typeof specs.hvBatteryUsableCapacityKwh).toBe('number');
      expect(specs.systemMotorPowerKw).toBe(208);
    });
  });

  describe('B — VW Tiguan eTSI 48V MHEV', () => {
    const raw = {
      resolvedVariant: 'Tiguan 1.5 eTSI',
      variantConfidence: 0.85,
      ambiguousVariants: ['Tiguan 1.5 eTSI'],
      electrificationLevel: 'MHEV_48V',
      drivetrain: 'FWD',
      hvBatteryPresent: true,
      hvBatteryUsableCapacityKwh: 0.5,
      tankCapacityLiters: 58,
    };

    it('does not treat MHEV as traction HV pack', () => {
      const { specs } = pipeline(raw, { make: 'VW', model: 'Tiguan', year: 2026 });
      expect(specs.electrificationLevel).toBe('MHEV_48V');
      expect(specs.hvBatteryPresent).toBe(false);
      expect(specs.hvBatteryUsableCapacityKwh).toBeNull();
    });
  });

  describe('C — ambiguous VW Tiguan (no trim)', () => {
    const raw = {
      resolvedVariant: null,
      variantConfidence: 0.35,
      ambiguousVariants: ['1.5 eTSI', '2.0 TDI', 'eHybrid'],
      electrificationLevel: 'NONE',
      drivetrain: 'FWD',
      curbWeightKg: 1650,
      engineDisplacementCc: 1498,
      frontPadThicknessMm: 12,
    };

    it('nulls variant-dependent numerics', () => {
      const { specs, rejectedFields } = pipeline(raw, { make: 'VW', model: 'Tiguan', year: 2024 });
      expect(rejectedFields.some((r) => r.startsWith('variant_gate'))).toBe(true);
      expect(specs.curbWeightKg).toBeNull();
      expect(specs.engineDisplacementCc).toBeNull();
      expect(specs.frontPadThicknessMm).toBeNull();
      expect(specs.drivetrain).toBe('FWD');
    });
  });

  describe('D — unknown / novel variant (conservative)', () => {
    it('accepts mostly-null output without inventing anchors', () => {
      const { specs } = pipeline(
        {
          variantConfidence: null,
          ambiguousVariants: null,
          electrificationLevel: null,
          drivetrain: null,
          hvBatteryPresent: null,
        },
        { make: 'Unknown', model: 'Concept X', year: 2027 },
      );
      expect(specs.hvBatteryPresent).toBeNull();
      expect(specs.systemMotorPowerKw).toBeNull();
      expect(specs.curbWeightKg).toBeNull();
    });
  });

  describe('E — invalid model payload (post-schema simulation)', () => {
    it('normalizes invalid enums and drops unknown keys via parse', () => {
      const { specs } = pipeline({
        drivetrain: 'NOT_A_REAL_AXLE',
        electrificationLevel: 'SUPER_HYBRID',
        hvBatteryPresent: 'maybe',
        cylinderCount: 2.7,
        extraHallucinatedField: 'drop-me',
        variantConfidence: 0.95,
        curbWeightKg: 1500,
      });
      expect(specs.drivetrain).toBeNull();
      expect(specs.electrificationLevel).toBeNull();
      expect(specs.hvBatteryPresent).toBeNull();
      expect(specs.cylinderCount).toBeNull();
      expect(specs).not.toHaveProperty('extraHallucinatedField');
      expect(specs.curbWeightKg).toBe(1500);
    });

    it('rejects out-of-range numerics in plausibility (no clamp)', () => {
      const { specs, rejectedFields } = pipeline({
        variantConfidence: 0.9,
        curbWeightKg: 50,
        systemMotorPowerKw: 150,
      });
      expect(specs.curbWeightKg).toBeNull();
      expect(rejectedFields).toContain('curbWeightKg');
    });
  });

  describe('failed provider call does not emit specs', () => {
    it('returns success:false without specs object', async () => {
      const llm = {
        isConfigured: jest.fn().mockReturnValue(true),
        activeProviderId: 'mistral',
        completeJson: jest.fn().mockRejectedValue(new Error('structured output validation failed')),
      };
      const svc = new VehicleSpecAiService(llm as never);
      const res = await svc.getVehicleSpecs(undefined, teslaContext);
      expect(res.success).toBe(false);
      expect(res.specs).toBeUndefined();
      expect(res.error).toMatch(/validation failed/i);
    });
  });
});
