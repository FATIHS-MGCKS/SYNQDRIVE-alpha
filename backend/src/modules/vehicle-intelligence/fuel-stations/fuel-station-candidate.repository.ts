import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { FuelStationRawCandidateRow } from './fuel-station-location.types';

export interface FuelStationDatasetStatus {
  ready: boolean;
  datasetVersion?: string;
  stationCount?: number;
  errorMessage?: string;
}

@Injectable()
export class FuelStationCandidateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentDatasetStatus(): Promise<FuelStationDatasetStatus> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ dataset_version: string; station_count: number }>
      >`
        SELECT dataset_version, station_count
        FROM osm.dataset_metadata
        WHERE is_current = true
        ORDER BY promoted_at DESC NULLS LAST
        LIMIT 1
      `;

      if (rows.length === 0) {
        return {
          ready: false,
          errorMessage: 'No current OSM fuel-station dataset metadata row found',
        };
      }

      const liveCount = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM osm.fuel_stations
      `;
      const stationCount = Number(liveCount[0]?.count ?? 0);
      if (stationCount <= 0) {
        return {
          ready: false,
          datasetVersion: rows[0].dataset_version,
          stationCount: 0,
          errorMessage: 'OSM fuel-station dataset is empty',
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
  ): Promise<FuelStationRawCandidateRow[]> {
    return this.prisma.$queryRaw<FuelStationRawCandidateRow[]>`
      WITH query AS (
        SELECT
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326) AS q_geom,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography AS q_geog
      )
      SELECT
        fs.osm_type,
        fs.osm_id,
        fs.name,
        fs.brand,
        fs.operator,
        fs.street,
        fs.housenumber,
        fs.postcode,
        fs.city,
        fs.dataset_version,
        ST_Y(fs.centroid::geometry)::float8 AS latitude,
        ST_X(fs.centroid::geometry)::float8 AS longitude,
        ST_Distance(fs.centroid, q.q_geog)::float8 AS point_distance_m,
        ST_Distance(fs.geom::geography, q.q_geog)::float8 AS geometry_distance_m,
        ST_Covers(fs.geom, q.q_geom) AS inside_geometry,
        GeometryType(fs.geom) AS geometry_type
      FROM osm.fuel_stations fs
      CROSS JOIN query q
      WHERE ST_DWithin(fs.centroid, q.q_geog, ${radiusMeters})
      ORDER BY fs.centroid <-> q.q_geog
      LIMIT ${limit}
    `;
  }

  async explainCandidateLookup(
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ plan: string }>>`
      EXPLAIN (FORMAT TEXT)
      SELECT fs.osm_id
      FROM osm.fuel_stations fs
      WHERE ST_DWithin(
        fs.centroid,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${radiusMeters}
      )
      ORDER BY fs.centroid <-> ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      LIMIT 10
    `;
    return rows.map((row) => row.plan).join('\n');
  }
}
