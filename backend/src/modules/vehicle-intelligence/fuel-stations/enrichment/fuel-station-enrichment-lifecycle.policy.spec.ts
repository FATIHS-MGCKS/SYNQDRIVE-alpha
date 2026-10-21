import {
  getFuelStationEnrichmentAutomaticSkipReason,
  shouldSkipAutomaticFuelStationEnrichment,
} from './fuel-station-enrichment-lifecycle.policy';
import { FUEL_STATION_RESOLVER_VERSION } from '../fuel-station-location.types';
import { buildFuelStationEnrichmentInputFingerprint } from './fuel-station-enrichment-fingerprint.util';

describe('fuel-station-enrichment-lifecycle.policy', () => {
  const fingerprint = buildFuelStationEnrichmentInputFingerprint({
    energyEventId: 'evt-1',
    latitude: 51.3,
    longitude: 9.5,
  });

  it('skips automatic processing for FAILED + same fingerprint', () => {
    expect(
      getFuelStationEnrichmentAutomaticSkipReason({
        enrichment: {
          processingStatus: 'FAILED',
          inputFingerprint: fingerprint,
          resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        } as never,
        inputFingerprint: fingerprint,
      }),
    ).toBe('terminal_failed');
  });

  it('skips automatic processing for COMPLETED NO_COORDINATES + same fingerprint', () => {
    const noCoordFingerprint = buildFuelStationEnrichmentInputFingerprint({
      energyEventId: 'evt-1',
      latitude: 0,
      longitude: 0,
    });
    expect(
      shouldSkipAutomaticFuelStationEnrichment({
        enrichment: {
          processingStatus: 'COMPLETED',
          resolutionStatus: 'NO_COORDINATES',
          inputFingerprint: noCoordFingerprint,
          resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        } as never,
        inputFingerprint: noCoordFingerprint,
      }),
    ).toBe(true);
  });

  it('does not skip when fingerprint changes', () => {
    expect(
      shouldSkipAutomaticFuelStationEnrichment({
        enrichment: {
          processingStatus: 'COMPLETED',
          resolutionStatus: 'MATCHED',
          inputFingerprint: fingerprint,
          resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        } as never,
        inputFingerprint: buildFuelStationEnrichmentInputFingerprint({
          energyEventId: 'evt-1',
          latitude: 51.31,
          longitude: 9.51,
        }),
      }),
    ).toBe(false);
  });

  it('allows retry for COMPLETED ERROR resolution', () => {
    expect(
      shouldSkipAutomaticFuelStationEnrichment({
        enrichment: {
          processingStatus: 'COMPLETED',
          resolutionStatus: 'ERROR',
          inputFingerprint: fingerprint,
          resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        } as never,
        inputFingerprint: fingerprint,
      }),
    ).toBe(false);
  });
});
