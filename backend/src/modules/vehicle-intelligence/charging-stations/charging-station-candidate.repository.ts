import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { ChargingStationRawCandidateRow } from './charging-station-location.types';

export interface ChargingStationDatasetStatus {
  ready: boolean;
  datasetVersion?: string;
  stationCount?: number;
  errorMessage?: string;
}

@Injectable()
export class ChargingStationCandidateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentDatasetStatus(): Promise<ChargingStationDatasetStatus> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ dataset_version: string; station_count: number }>
      >`
        SELECT dataset_version, station_count
        FROM osm.charging_station_dataset_metadata
        WHERE is_current = true
        ORDER BY promoted_at DESC NULLS LAST
        LIMIT 1
      `;

      if (rows.length === 0) {
        return {
          ready: false,
          errorMessage: 'No current OSM charging-station dataset metadata row found',
        };
      }

      const liveCount = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM osm.charging_stations
      `;
      const stationCount = Number(liveCount[0]?.count ?? 0);
      if (stationCount <= 0) {
        return {
          ready: false,
          datasetVersion: rows[0].dataset_version,
          stationCount: 0,
          errorMessage: 'OSM charging-station dataset is empty',
        };
      }

      return {
        ready: true,
        datasetVersion: rows[0].dataset_version,
        stationCount,
      };
    } catch (error) {
      return {
        ready: false,
        errorMessage: error instanceof Error ? error.message : 'Dataset status query failed',
      };
    }
  }

  async findCandidatesNear(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    limit: number,
  ): Promise<ChargingStationRawCandidateRow[]> {
    return this.prisma.$queryRaw<ChargingStationRawCandidateRow[]>`
      WITH query AS (
        SELECT
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326) AS q_geom,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography AS q_geog
      )
      SELECT
        cs.osm_type,
        cs.osm_id,
        cs.name,
        cs.brand,
        cs.operator,
        cs.network,
        cs.street,
        cs.housenumber,
        cs.postcode,
        cs.city,
        cs.access,
        cs.fee,
        cs.capacity,
        cs.dataset_version,
        ST_Y(cs.centroid::geometry)::float8 AS latitude,
        ST_X(cs.centroid::geometry)::float8 AS longitude,
        ST_Distance(cs.centroid, q.q_geog)::float8 AS point_distance_m,
        ST_Distance(cs.geom::geography, q.q_geog)::float8 AS geometry_distance_m,
        ST_Covers(cs.geom, q.q_geom) AS inside_geometry,
        GeometryType(cs.geom) AS geometry_type,
        cs.tags
      FROM osm.charging_stations cs
      CROSS JOIN query q
      WHERE ST_DWithin(cs.centroid, q.q_geog, ${radiusMeters})
      ORDER BY ST_Distance(cs.geom::geography, q.q_geog)
      LIMIT ${limit}
    `;
  }

  async explainCandidateLookup(
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<Record<string, string>>>`
      EXPLAIN (FORMAT TEXT)
      SELECT cs.osm_id
      FROM osm.charging_stations cs
      WHERE ST_DWithin(
        cs.centroid,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${radiusMeters}
      )
      ORDER BY cs.centroid <-> ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      LIMIT 10
    `;
    return rows
      .map((row) => row.plan ?? row['QUERY PLAN'] ?? Object.values(row)[0] ?? '')
      .join('\n');
  }
}
