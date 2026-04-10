import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DimoAuthService } from './dimo-auth.service';
import { DimoTelemetryService } from './dimo-telemetry.service';
import { DimoVehicleSyncService, DimoVehicleInput } from './dimo-vehicle-sync.service';

// GraphQL query: fetch all vehicles that have granted privileges to this developer license.
// Uses DIMO Identity GraphQL API (public, no auth required).
// `privileged: $clientId` returns vehicles whose owner granted access to the developer license address.
const VEHICLES_FOR_DEVELOPER_QUERY = `
  query VehiclesForDeveloper($clientId: Address!) {
    vehicles(first: 100, filterBy: { privileged: $clientId }) {
      totalCount
      nodes {
        tokenId
        owner
        mintedAt
        definition {
          make
          model
          year
          id
        }
        aftermarketDevice {
          serial
          pairedAt
        }
        syntheticDevice {
          tokenId
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// Second page query with cursor
const VEHICLES_FOR_DEVELOPER_PAGE_QUERY = `
  query VehiclesForDeveloperPage($clientId: Address!, $after: String!) {
    vehicles(first: 100, after: $after, filterBy: { privileged: $clientId }) {
      totalCount
      nodes {
        tokenId
        owner
        mintedAt
        definition {
          make
          model
          year
          id
        }
        aftermarketDevice {
          serial
          pairedAt
        }
        syntheticDevice {
          tokenId
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface IdentityVehicleNode {
  tokenId: number;
  owner: string;
  mintedAt: string;
  definition?: {
    make?: string;
    model?: string;
    year?: number;
    id?: string;
  };
  aftermarketDevice?: {
    serial?: string;
    pairedAt?: string | null;
  };
  syntheticDevice?: {
    tokenId?: number;
  };
}

@Injectable()
export class DimoApiSyncService {
  private readonly logger = new Logger(DimoApiSyncService.name);

  constructor(
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly dimoVehicleSync: DimoVehicleSyncService,
    private readonly configService: ConfigService,
  ) {}

  async fetchAndSyncFromDimoApi(): Promise<{ synced: number }> {
    const clientId = this.configService.get<string>('dimo.clientId') || '';
    if (!clientId) {
      throw new Error('DIMO_CLIENT_ID and DIMO_PRIVATE_KEY must be set in .env. Get them from https://console.dimo.org');
    }

    const identityApiUrl = this.configService.get<string>('dimo.apiUrl') || 'https://identity-api.dimo.zone';
    const graphqlUrl = `${identityApiUrl}/query`;

    this.logger.log(`Fetching vehicles from DIMO Identity GraphQL for clientId=${clientId}`);

    const vehicles = await this.fetchAllVehiclesFromIdentityApi(graphqlUrl, clientId);

    if (vehicles.length === 0) {
      this.logger.log('No vehicles found in DIMO for this developer license. Ensure vehicles have granted privilege to your clientId.');
      return { synced: 0 };
    }

    this.logger.log(`Fetched ${vehicles.length} vehicles from DIMO Identity API`);

    // Step 1: Build initial inputs from Identity API data
    const inputs: DimoVehicleInput[] = vehicles.map((v) => ({
      externalId: String(v.tokenId),
      tokenId: typeof v.tokenId === 'number' ? v.tokenId : parseInt(String(v.tokenId), 10),
      vin: undefined,
      make: v.definition?.make ?? undefined,
      model: v.definition?.model ?? undefined,
      year: v.definition?.year ?? undefined,
      fuelType: undefined,
      odometerKm: undefined,
      lastSignal: v.aftermarketDevice?.pairedAt
        ? new Date(v.aftermarketDevice.pairedAt)
        : undefined,
      connectionStatus: v.aftermarketDevice || v.syntheticDevice ? 'CONNECTED' : 'DISCONNECTED',
      rawJson: v as object,
    }));

    // Step 2: Enrich each connected vehicle with telemetry data
    for (const input of inputs) {
      if (input.connectionStatus !== 'CONNECTED' || input.tokenId == null) continue;
      try {
        const vehicleJwt = await this.dimoAuth.getVehicleJwt(input.tokenId);
        const summary = await this.dimoTelemetry.fetchVehicleSummary(vehicleJwt, input.tokenId);

        if (summary.odometerKm != null) input.odometerKm = summary.odometerKm;
        if (summary.batteryPercent != null) input.batteryPercent = summary.batteryPercent;
        if (summary.fuelPercent != null) input.fuelPercent = summary.fuelPercent;
        if (summary.lastSignalAt != null) input.lastSignal = summary.lastSignalAt;
        if (summary.powertrainType != null) input.powertrainType = summary.powertrainType;

        // Attempt VIN fetch (requires VEHICLE_VIN_CREDENTIAL privilege)
        const vin = await this.dimoTelemetry.fetchVehicleVin(vehicleJwt, input.tokenId);
        if (vin) input.vin = vin;

        this.logger.debug(
          `Enriched tokenId=${input.tokenId}: odometer=${input.odometerKm} battery=${input.batteryPercent} fuel=${input.fuelPercent} vin=${input.vin ?? 'n/a'}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Telemetry enrichment failed for tokenId=${input.tokenId}: ${msg}`);
      }
    }

    await this.dimoVehicleSync.syncMirroredVehicles(inputs);
    return { synced: inputs.length };
  }

  private async fetchAllVehiclesFromIdentityApi(
    graphqlUrl: string,
    clientId: string,
  ): Promise<IdentityVehicleNode[]> {
    type GqlResponse = {
      data?: {
        vehicles?: {
          nodes: IdentityVehicleNode[];
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      };
      errors?: Array<{ message: string }>;
    };
    type GqlVariables = { clientId: string; after?: string };

    const allVehicles: IdentityVehicleNode[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const gqlQuery: string = cursor
        ? VEHICLES_FOR_DEVELOPER_PAGE_QUERY
        : VEHICLES_FOR_DEVELOPER_QUERY;
      const variables: GqlVariables = cursor
        ? { clientId, after: cursor }
        : { clientId };

      const response = await axios.post<GqlResponse>(
        graphqlUrl,
        { query: gqlQuery, variables },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        },
      );

      if (response.data.errors?.length) {
        const errMsg = response.data.errors
          .map((e: { message: string }) => e.message)
          .join('; ');
        this.logger.error(`DIMO Identity GraphQL errors: ${errMsg}`);
        throw new Error(`DIMO Identity API returned errors: ${errMsg}`);
      }

      const vehiclesPage = response.data?.data?.vehicles;
      if (!vehiclesPage) break;

      allVehicles.push(...vehiclesPage.nodes);
      hasNextPage = vehiclesPage.pageInfo.hasNextPage;
      cursor = vehiclesPage.pageInfo.endCursor ?? null;

      this.logger.debug(
        `Fetched ${vehiclesPage.nodes.length} vehicles, total so far: ${allVehicles.length}`,
      );
    }

    return allVehicles;
  }
}
