import { Injectable, Logger } from '@nestjs/common';
import { isValidFuelStationCoordinateInput } from './fuel-station-coordinate.util';
import { FuelStationCandidateRepository } from './fuel-station-candidate.repository';
import {
  buildResolveDiagnostics,
  scoreFuelStationCandidates,
} from './fuel-station-resolve.pipeline';
import { dedupeFuelStationCandidates } from './fuel-station-dedupe';
import {
  FALLBACK_SEARCH_RADIUS_METERS,
  MAX_CANDIDATES,
  PRIMARY_SEARCH_RADIUS_METERS,
} from './fuel-station-location.constants';
import {
  FUEL_STATION_RESOLVER_VERSION,
  type FuelStationResolveInput,
  type FuelStationResolveResult,
} from './fuel-station-location.types';
import { decideFuelStationMatch } from './fuel-station-match-decision';

@Injectable()
export class FuelStationLocationResolverService {
  private readonly logger = new Logger(FuelStationLocationResolverService.name);

  constructor(private readonly candidateRepository: FuelStationCandidateRepository) {}

  async resolve(input: FuelStationResolveInput): Promise<FuelStationResolveResult> {
    if (!isValidFuelStationCoordinateInput(input)) {
      return {
        status: 'INVALID_COORDINATES',
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        errorMessage: 'Latitude must be within [-90, 90] and longitude within [-180, 180]',
      };
    }

    const datasetStatus = await this.candidateRepository.getCurrentDatasetStatus();
    if (!datasetStatus.ready || !datasetStatus.datasetVersion) {
      return {
        status: 'ERROR',
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        errorMessage: datasetStatus.errorMessage ?? 'OSM fuel-station dataset unavailable',
      };
    }

    try {
      const started = Date.now();
      let usedFallbackRadius = false;
      let searchRadiusMeters = PRIMARY_SEARCH_RADIUS_METERS;

      let rawRows = await this.candidateRepository.findCandidatesNear(
        input.latitude,
        input.longitude,
        searchRadiusMeters,
        MAX_CANDIDATES,
      );

      if (rawRows.length === 0) {
        usedFallbackRadius = true;
        searchRadiusMeters = FALLBACK_SEARCH_RADIUS_METERS;
        rawRows = await this.candidateRepository.findCandidatesNear(
          input.latitude,
          input.longitude,
          searchRadiusMeters,
          MAX_CANDIDATES,
        );
      }

      const queryLatencyMs = Date.now() - started;
      const scored = scoreFuelStationCandidates(rawRows);
      const { candidates: deduped, mergedCount } = dedupeFuelStationCandidates(scored);

      const diagnostics = buildResolveDiagnostics({
        searchRadiusMeters,
        usedFallbackRadius,
        rawCandidateCount: rawRows.length,
        dedupedCandidateCount: deduped.length,
        queryLatencyMs,
        dedupeMergedCount: mergedCount,
      });

      return decideFuelStationMatch(deduped, datasetStatus.datasetVersion, diagnostics);
    } catch (error) {
      this.logger.error(
        'Fuel station resolver query failed',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        status: 'ERROR',
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        datasetVersion: datasetStatus.datasetVersion,
        errorMessage: error instanceof Error ? error.message : 'Fuel station resolver query failed',
      };
    }
  }

  async explainLookupPlan(latitude: number, longitude: number, radiusMeters = PRIMARY_SEARCH_RADIUS_METERS) {
    return this.candidateRepository.explainCandidateLookup(latitude, longitude, radiusMeters);
  }
}
