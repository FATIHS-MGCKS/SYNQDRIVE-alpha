import { DimoDeviceConnectionEventType } from '@prisma/client';
import { DeviceConnectionEpisodeResolutionMethod } from '@prisma/client';
import { anonymizeVehicleId, FIXTURE_VEHICLE_ALIASES } from './device-connection-episode-reconciliation.anonymize';
import {
  reconcileVehicleEpisodes,
  resolveBindingClass,
} from './device-connection-episode-reconciliation.engine';
import {
  RECONCILIATION_FIXTURE_VEHICLES,
  buildFixtureReconciliationReport,
  enrichFixtureVehicle,
} from './device-connection-episode-reconciliation.fixtures';
import {
  renderReconciliationCsv,
  renderReconciliationMarkdown,
} from './device-connection-episode-reconciliation.report';

describe('device-connection-episode-reconciliation', () => {
  describe('anonymization', () => {
    it('hashes vehicle ids without exposing raw uuid', () => {
      const alias = anonymizeVehicleId('00000000-0000-4000-8000-000000000001');
      expect(alias).toMatch(/^VEHICLE_[A-F0-9]{8}$/);
      expect(alias).not.toContain('00000000');
    });
  });

  describe('binding class', () => {
    it('maps LTE_R1 to physical OBD', () => {
      expect(resolveBindingClass('LTE_R1')).toBe('PHYSICAL_OBD_LTE_R1');
    });
    it('maps OEM to non-OBD closure path', () => {
      expect(resolveBindingClass('OEM_API')).toBe('OEM_API');
    });
  });

  describe('fixture scenarios', () => {
    function candidateFor(alias: string) {
      const vehicle = RECONCILIATION_FIXTURE_VEHICLES.find(
        (v) => v.anonymizedVehicleId === alias,
      )!;
      return reconcileVehicleEpisodes(enrichFixtureVehicle(vehicle))[0]!;
    }

    it('INCIDENT — telemetry recovery with open episode', () => {
      const c = candidateFor(FIXTURE_VEHICLE_ALIASES.INCIDENT);
      expect(c.classification).toBe('SHOULD_RESOLVE_BY_TELEMETRY');
      expect(c.recommendedResolutionMethod).toBe(
        DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED,
      );
      expect(c.applyEligible).toBe(true);
      expect(c.tripAfterUnplug).toBe(true);
      expect(c.sustainedTelemetry).toBe(true);
    });

    it('explicit plug — RESOLVED_EXPLICIT', () => {
      const c = candidateFor(FIXTURE_VEHICLE_ALIASES.EXPLICIT_PLUG);
      expect(c.classification).toBe('RESOLVED_EXPLICIT');
      expect(c.explicitPlugSignal).toBe(true);
      expect(c.applyEligible).toBe(false);
    });

    it('stale snapshot — not eligible for snapshot closure', () => {
      const c = candidateFor(FIXTURE_VEHICLE_ALIASES.STALE_SNAPSHOT);
      expect(c.classification).toBe('OPEN_CONFIRMED');
      expect(c.conflicts.some((x) => x.includes('SNAPSHOT') || x.includes('TELEMETRY'))).toBe(true);
      expect(c.applyEligible).toBe(false);
      expect(c.reviewRequired).toBe(true);
    });

    it('OEM telemetry — no OBD closure', () => {
      const c = candidateFor(FIXTURE_VEHICLE_ALIASES.OEM_TELEMETRY);
      expect(c.classification).toBe('NOT_ENOUGH_DATA');
      expect(c.applyEligible).toBe(false);
      expect(c.conflicts).toContain('OEM_OR_SYNTHETIC_NO_OBD_CLOSURE');
    });

    it('binding change — superseded episode (auto-apply when open)', () => {
      const c = candidateFor(FIXTURE_VEHICLE_ALIASES.BINDING_CHANGE);
      expect(c.classification).toBe('SUPERSEDED_BY_BINDING_CHANGE');
      expect(c.recommendedResolutionMethod).toBe(
        DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED,
      );
      expect(c.applyEligible).toBe(true);
      expect(c.reviewRequired).toBe(false);
    });

    it('duplicate unplug events — DUPLICATE classification', () => {
      const c = candidateFor(FIXTURE_VEHICLE_ALIASES.DUPLICATE);
      expect(c.classification).toBe('DUPLICATE');
      expect(c.applyEligible).toBe(false);
    });

    it('out-of-order plug — OUT_OF_ORDER', () => {
      const c = candidateFor(FIXTURE_VEHICLE_ALIASES.OUT_OF_ORDER);
      expect(c.classification).toBe('OUT_OF_ORDER');
      expect(c.conflicts.some((x) => x.includes('PLUG') || x.includes('ORDER'))).toBe(true);
    });

    it('unresolved physical unplug — OPEN_CONFIRMED', () => {
      const c = candidateFor(FIXTURE_VEHICLE_ALIASES.UNRESOLVED);
      expect(c.classification).toBe('OPEN_CONFIRMED');
      expect(c.explicitPlugSignal).toBe(false);
      expect(c.applyEligible).toBe(false);
    });
  });

  describe('report outputs', () => {
    it('renders anonymized CSV with required columns only', () => {
      const report = buildFixtureReconciliationReport();
      const csv = renderReconciliationCsv(report.candidates);
      const lines = csv.trim().split('\n');
      expect(lines[0]).toBe(
        'anonymizedVehicleId,provider,bindingClass,openedAt,latestEventAt,firstTelemetryAfterUnplug,explicitPlugSignal,sustainedTelemetry,tripAfterUnplug,classification,recommendedResolutionMethod,confidence,conflicts,applyEligible,historicalSamplesAfterUnplug,historicalSources,latestStateOnlyEvidence',
      );
      expect(lines.length).toBe(report.candidates.length + 1);
      expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
      expect(csv).toContain('FIXTURE_INCIDENT_001');
    });

    it('renders markdown summary in READ_ONLY mode', () => {
      const report = buildFixtureReconciliationReport();
      const md = renderReconciliationMarkdown(report);
      expect(md).toContain('READ_ONLY');
      expect(md).toContain('FIXTURE_INCIDENT_001');
      expect(md).toContain('SHOULD_RESOLVE_BY_TELEMETRY');
    });

    it('classifies all fixture vehicles reproducibly', () => {
      const report = buildFixtureReconciliationReport();
      expect(report.summary.totalCandidates).toBe(8);
      expect(report.mode).toBe('READ_ONLY');
      expect(report.summary.reviewRequiredCount).toBeGreaterThan(0);
    });
  });

  describe('snapshot recovery guardrails', () => {
    it('blocks snapshot closure when obdIsPluggedIn is false', () => {
      const vehicle = RECONCILIATION_FIXTURE_VEHICLES.find(
        (v) => v.anonymizedVehicleId === FIXTURE_VEHICLE_ALIASES.UNRESOLVED,
      )!;
      const c = reconcileVehicleEpisodes(enrichFixtureVehicle(vehicle))[0]!;
      expect(c.classification).toBe('OPEN_CONFIRMED');
      expect(c.conflicts).toContain('SNAPSHOT_NOT_PLUGGED');
    });

    it('prefers snapshot signal over telemetry when both are eligible', () => {
      const incident = RECONCILIATION_FIXTURE_VEHICLES.find(
        (v) => v.anonymizedVehicleId === FIXTURE_VEHICLE_ALIASES.INCIDENT,
      )!;
      const withSnapshot = enrichFixtureVehicle({
        ...incident,
        snapshot: {
          ...incident.snapshot,
          obdIsPluggedIn: true,
        },
      });
      const c = reconcileVehicleEpisodes(withSnapshot)[0]!;
      expect(c.classification).toBe('SHOULD_RESOLVE_BY_SNAPSHOT_SIGNAL');
    });
  });

  describe('history window independence', () => {
    it('episode classification does not depend on display window filtering', () => {
      const incident = RECONCILIATION_FIXTURE_VEHICLES.find(
        (v) => v.anonymizedVehicleId === FIXTURE_VEHICLE_ALIASES.INCIDENT,
      )!;
      const withAllEvents = reconcileVehicleEpisodes(enrichFixtureVehicle(incident))[0]!;
      const trimmed = {
        ...incident,
        events: incident.events.filter(
          (e) => e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        ),
      };
      const withTrimmed = reconcileVehicleEpisodes(enrichFixtureVehicle(trimmed))[0]!;
      expect(withAllEvents.classification).toBe(withTrimmed.classification);
    });
  });
});
