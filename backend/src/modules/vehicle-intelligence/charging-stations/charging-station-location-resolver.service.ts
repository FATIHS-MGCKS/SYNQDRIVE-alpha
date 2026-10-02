import { Injectable, Logger } from '@nestjs/common';
import { isValidChargingStationCoordinateInput } from './charging-station-coordinate.util';
import { ChargingStationCandidateRepository } from './charging-station-candidate.repository';
import {
  buildResolveDiagnostics,
  scoreChargingStationCandidates,
} from './charging-station-resolve.pipeline';
import { dedupeChargingStationCandidates } from './charging-station-dedupe';
import {
  FALLBACK_SEARCH_RADIUS_METERS,
  MAX_CANDIDATES,
  PRIMARY_SEARCH_RADIUS_METERS,
} from './charging-station-location.constants';
import {
  CHARGING_STATION_RESOLVER_VERSION,
  type ChargingStationResolveInput,
  type ChargingStationResolveResult,
} from './charging-station-location.types';
import { decideChargingStationMatch } from './charging-station-match-decision';

@Injectable()
export class ChargingStationLocationResolverService {
  private readonly logger = new Logger(ChargingStationLocationResolverService.name);

  constructor(private readonly candidateRepository: ChargingStationCandidateRepository) {}

  async resolve(input: ChargingStationResolveInput): Promise<ChargingStationResolveResult> {
    if (!isValidChargingStationCoordinateInput(input)) {
      return {
        status: 'INVALID_COORDINATES',
        resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
        errorMessage: 'Latitude must be within [-90, 90] and longitude within [-180, 180]',
      };
    }

    const datasetStatus = await this.candidateRepository.getCurrentDatasetStatus();
    if (!datasetStatus.ready || !datasetStatus.datasetVersion) {
      return {
        status: 'ERROR',
        resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
        errorMessage: datasetStatus.errorMessage ?? 'OSM charging-station dataset unavailable',
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
      const scored = scoreChargingStationCandidates(rawRows);
      const { candidates: deduped, mergedCount } = dedupeChargingStationCandidates(scored);

      const diagnostics = buildResolveDiagnostics({
        searchRadiusMeters,
        usedFallbackRadius,
        rawCandidateCount: rawRows.length,
        dedupedCandidateCount: deduped.length,
        queryLatencyMs,
        dedupeMergedCount: mergedCount,
      });

      return decideChargingStationMatch(deduped, datasetStatus.datasetVersion, diagnostics);
    } catch (error) {
      this.logger.error(
        'Charging station resolver query failed',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        status: 'ERROR',
        resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
        datasetVersion: datasetStatus.datasetVersion,
        errorMessage:
          error instanceof Error ? error.message : 'Charging station resolver query failed',
      };
    }
  }

  async explainLookupPlan(latitude: number, longitude: number, radiusMeters = PRIMARY_SEARCH_RADIUS_METERS) {
    return this.candidateRepository.explainCandidateLookup(latitude, longitude, radiusMeters);
  }
}
