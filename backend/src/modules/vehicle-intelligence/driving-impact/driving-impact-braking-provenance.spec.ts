import { DrivingEventType } from '@prisma/client';
import {
  BRAKING_PROVENANCE_VERSION,
  buildBrakingProvenanceSummary,
  computeBrakingStatistics,
  mapHfBrakingRow,
  mapNativeDrivingEventToBrakingRow,
  reduceHealthEligibilityForBrakeProxy,
  synthesizeNativeBrakeDecelProxy,
  synthesizeProxyEndSpeedKmh,
} from './driving-impact-braking-provenance';

const STOP_THRESHOLD = 5;
const HIGH_SPEED_THRESHOLD = 80;

describe('driving-impact-braking-provenance', () => {
  describe('mapNativeDrivingEventToBrakingRow', () => {
    it('uses MEASURED_DELTA end speed when provider supplies deltaKmh', () => {
      const row = mapNativeDrivingEventToBrakingRow({
        eventType: DrivingEventType.HARSH_BRAKING,
        speedKmh: 60,
        severity: 0.6,
        deltaKmh: 15,
      });

      expect(row.endSpeedKmh).toBe(45);
      expect(row.endSpeedSource).toBe('MEASURED_DELTA');
      expect(row.decelSource).toBe('ESTIMATED_PROXY');
      expect(row.providerClassified).toBe(true);
    });

    it('does not store estimated end speed when deltaKmh is missing', () => {
      const row = mapNativeDrivingEventToBrakingRow({
        eventType: DrivingEventType.EXTREME_BRAKING,
        speedKmh: 80,
        severity: 0.9,
        deltaKmh: null,
      });

      expect(row.endSpeedKmh).toBeNull();
      expect(row.endSpeedSource).toBe('NONE');
      expect(row.decelSource).toBe('ESTIMATED_PROXY');
      expect(row.peakDecelMs2).toBeGreaterThan(0);
    });

    it('tags synthetic deceleration as ESTIMATED_PROXY severity proxy', () => {
      const harsh = synthesizeNativeBrakeDecelProxy(DrivingEventType.HARSH_BRAKING, 0.6);
      const extreme = synthesizeNativeBrakeDecelProxy(DrivingEventType.EXTREME_BRAKING, 0.9);

      expect(harsh).toBeGreaterThan(0);
      expect(extreme).toBeGreaterThan(harsh);
    });
  });

  describe('mapHfBrakingRow', () => {
    it('marks HF reconstruction as RECONSTRUCTED kinematics', () => {
      const row = mapHfBrakingRow({
        startSpeedKmh: 90,
        endSpeedKmh: 10,
        peakValue: 6.2,
      });

      expect(row.endSpeedSource).toBe('RECONSTRUCTED');
      expect(row.decelSource).toBe('RECONSTRUCTED');
      expect(row.providerClassified).toBe(false);
    });
  });

  describe('computeBrakingStatistics', () => {
    it('keeps proxy p95 separate from reconstructed measured p95', () => {
      const rows = [
        mapHfBrakingRow({ startSpeedKmh: 100, endSpeedKmh: 20, peakValue: 7.5 }),
        mapNativeDrivingEventToBrakingRow({
          eventType: DrivingEventType.HARSH_BRAKING,
          speedKmh: 50,
          severity: 0.6,
          deltaKmh: null,
        }),
      ];

      const stats = computeBrakingStatistics(rows, 50, {
        stopSpeedThresholdKmh: STOP_THRESHOLD,
        highSpeedBrakeThresholdKmh: HIGH_SPEED_THRESHOLD,
      });

      expect(stats.p95NegativeDecelMeasured).toBe(7.5);
      expect(stats.p95NegativeDecelProxy).toBeGreaterThan(0);
      expect(stats.p95NegativeDecel).toBe(7.5);
      expect(stats.reconstructedKinematicCount).toBe(1);
      expect(stats.proxyKinematicCount).toBe(1);
    });

    it('excludes missing end speed from measured stop density and energy', () => {
      const rows = [
        mapNativeDrivingEventToBrakingRow({
          eventType: DrivingEventType.HARSH_BRAKING,
          speedKmh: 60,
          severity: 0.6,
          deltaKmh: null,
        }),
        mapNativeDrivingEventToBrakingRow({
          eventType: DrivingEventType.HARSH_BRAKING,
          speedKmh: 40,
          severity: 0.6,
          deltaKmh: 40,
        }),
      ];

      const stats = computeBrakingStatistics(rows, 50, {
        stopSpeedThresholdKmh: STOP_THRESHOLD,
        highSpeedBrakeThresholdKmh: HIGH_SPEED_THRESHOLD,
      });

      expect(stats.stopDensity).toBeCloseTo(0.02, 2);
      expect(stats.meanBrakeEnergyPerKm).toBeGreaterThan(0);
      expect(stats.meanBrakeEnergyProxyPerKm).toBeGreaterThan(stats.meanBrakeEnergyPerKm);
    });

    it('stores proxy brake energy separately without implying physical precision', () => {
      const rows = [
        mapNativeDrivingEventToBrakingRow({
          eventType: DrivingEventType.EXTREME_BRAKING,
          speedKmh: 80,
          severity: 0.9,
          deltaKmh: null,
        }),
      ];

      const stats = computeBrakingStatistics(rows, 10, {
        stopSpeedThresholdKmh: STOP_THRESHOLD,
        highSpeedBrakeThresholdKmh: HIGH_SPEED_THRESHOLD,
      });

      expect(stats.meanBrakeEnergyPerKm).toBe(0);
      expect(stats.meanBrakeEnergyProxyPerKm).toBeGreaterThan(0);
      expect(synthesizeProxyEndSpeedKmh(80)).toBeCloseTo(57.6, 1);
    });
  });

  describe('buildBrakingProvenanceSummary', () => {
    it('exports braking provenance version and proxy share', () => {
      const stats = computeBrakingStatistics(
        [
          mapNativeDrivingEventToBrakingRow({
            eventType: DrivingEventType.HARSH_BRAKING,
            speedKmh: 50,
            severity: 0.6,
            deltaKmh: null,
          }),
        ],
        20,
        {
          stopSpeedThresholdKmh: STOP_THRESHOLD,
          highSpeedBrakeThresholdKmh: HIGH_SPEED_THRESHOLD,
        },
      );

      const summary = buildBrakingProvenanceSummary(stats);
      expect(summary.version).toBe(BRAKING_PROVENANCE_VERSION);
      expect(summary.proxyKinematicShare).toBe(1);
    });
  });

  describe('reduceHealthEligibilityForBrakeProxy', () => {
    it('reduces eligibility when proxy kinematics dominate', () => {
      expect(reduceHealthEligibilityForBrakeProxy('HIGH', 0.8)).toBe('MEDIUM');
      expect(reduceHealthEligibilityForBrakeProxy('MEDIUM', 0.6)).toBe('LOW');
      expect(reduceHealthEligibilityForBrakeProxy('HIGH', 0.3)).toBe('HIGH');
    });
  });
});
