import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DimoVehicleSyncService } from './dimo-vehicle-sync.service';
import { DimoApiSyncService } from './dimo-api-sync.service';
import { DimoAuthService } from './dimo-auth.service';
import { DimoTelemetryService } from './dimo-telemetry.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import type { DimoVehicleInput } from './dimo-vehicle-sync.service';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoConnectionStatus } from '@prisma/client';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import { LiveGpsEnforcementService } from '@modules/data-authorizations/live-gps-enforcement/live-gps-enforcement.service';
import {
  LIVE_GPS_PURPOSE,
  LIVE_GPS_SERVICE_IDENTITY,
} from '@modules/data-authorizations/live-gps-enforcement/live-gps-enforcement.constants';

const CONNECTION_STATUS_MAP: Record<DimoConnectionStatus, string> = {
  CONNECTED: 'Connected',
  DISCONNECTED: 'Disconnected',
  PENDING: 'Disconnected',
  ERROR: 'Disconnected',
};

@Controller('admin/dimo')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class DimoController {
  constructor(
    private readonly dimoVehicleSync: DimoVehicleSyncService,
    private readonly dimoApiSync: DimoApiSyncService,
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly prisma: PrismaService,
    private readonly liveGpsEnforcement: LiveGpsEnforcementService,
  ) {}

  @Get('vehicles')
  async listMirroredVehicles() {
    const vehicles = await this.prisma.dimoVehicle.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return vehicles.map((dv) => ({
      id: dv.id,
      tokenId: dv.tokenId ?? null,
      vin: dv.vin ?? '',
      make: dv.make ?? '',
      model: dv.model ?? '',
      year: dv.year ?? 0,
      odometer: dv.odometerKm ?? 0,
      battery: dv.batteryPercent ?? null,
      fuelLevel: dv.fuelPercent ?? null,
      powertrainType: dv.powertrainType ?? null,
      lastSignal: dv.lastSignal?.toISOString() ?? '',
      connectionStatus:
        CONNECTION_STATUS_MAP[dv.connectionStatus] ?? 'Disconnected',
    }));
  }

  @Get('non-registered')
  async getNonRegisteredVehicles() {
    return this.dimoVehicleSync.getNonRegisteredVehicles();
  }

  /**
   * Refresh telemetry snapshot for a single non-registered DIMO vehicle.
   * Fetches fresh data from the DIMO Telemetry API and updates the DB record.
   */
  @Post('vehicles/:id/refresh-snapshot')
  async refreshVehicleSnapshot(@Param('id') id: string) {
    const dv = await this.prisma.dimoVehicle.findUnique({ where: { id } });
    if (!dv) throw new NotFoundException(`DIMO vehicle ${id} not found`);
    if (dv.tokenId == null) {
      throw new BadRequestException('Vehicle has no DIMO token ID – cannot fetch telemetry');
    }

    try {
      const vehicleJwt = await this.dimoAuth.getVehicleJwt(dv.tokenId);
      const summary = await this.dimoTelemetry.fetchVehicleSummary(vehicleJwt, dv.tokenId);
      const vin = await this.dimoTelemetry.fetchVehicleVin(vehicleJwt, dv.tokenId);

      const updated = await this.prisma.dimoVehicle.update({
        where: { id },
        data: {
          ...(summary.odometerKm != null && { odometerKm: summary.odometerKm }),
          ...(summary.batteryPercent != null && { batteryPercent: summary.batteryPercent }),
          ...(summary.fuelPercent != null && { fuelPercent: summary.fuelPercent }),
          ...(summary.lastSignalAt != null && { lastSignal: summary.lastSignalAt }),
          ...(summary.powertrainType != null && { powertrainType: summary.powertrainType }),
          ...(vin && { vin }),
          syncedAt: new Date(),
        },
      });

      return {
        id: updated.id,
        vin: updated.vin ?? '',
        make: updated.make ?? '',
        model: updated.model ?? '',
        year: updated.year ?? 0,
        odometer: updated.odometerKm ?? 0,
        battery: updated.batteryPercent ?? null,
        fuelLevel: updated.fuelPercent ?? null,
        powertrainType: updated.powertrainType ?? null,
        lastSignal: updated.lastSignal?.toISOString() ?? '',
        connectionStatus: CONNECTION_STATUS_MAP[updated.connectionStatus] ?? 'Disconnected',
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      throw new BadRequestException(`Snapshot refresh failed: ${msg}`);
    }
  }

  @Post('sync')
  async sync(@Body() body: { dimoVehicles?: DimoVehicleInput[] }) {
    if (body.dimoVehicles?.length) {
      await this.dimoVehicleSync.syncMirroredVehicles(body.dimoVehicles);
      return { success: true, synced: body.dimoVehicles.length };
    }
    try {
      const { synced } = await this.dimoApiSync.fetchAndSyncFromDimoApi();
      return { success: true, synced, message: `${synced} vehicles synced from DIMO API` };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('DIMO_CLIENT_ID') || msg.includes('DIMO_PRIVATE_KEY')) {
        throw new BadRequestException(
          'DIMO not configured. Set DIMO_CLIENT_ID and DIMO_PRIVATE_KEY in .env. Get credentials from https://console.dimo.org',
        );
      }
      if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
        throw new BadRequestException(
          'Cannot reach DIMO API. Check your network and DIMO_API_URL in .env.',
        );
      }
      throw new BadRequestException(`DIMO sync failed: ${msg}`);
    }
  }

  @Get('debug-jwt')
  async debugJwt() {
    const jwt = await this.dimoAuth.getDeveloperJwt();
    const parts = jwt.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return { jwt: jwt.substring(0, 50) + '…', payload };
  }

  @Get('stats')
  async getConnectionStats() {
    const [connected, disconnected, total] = await Promise.all([
      this.prisma.dimoVehicle.count({
        where: { connectionStatus: 'CONNECTED' },
      }),
      this.prisma.dimoVehicle.count({
        where: { connectionStatus: { in: ['DISCONNECTED', 'PENDING', 'ERROR'] } },
      }),
      this.prisma.dimoVehicle.count(),
    ]);
    return { connected, disconnected, total };
  }

  @Get('fleet-connectivity')
  async getAdminFleetConnectivity() {
    const now = Date.now();

    const vehicles = await this.prisma.vehicle.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        dimoVehicle: true,
        latestState: true,
        organization: { select: { id: true, companyName: true } },
      },
    });

    const recentPollLogs = await this.prisma.dimoPollLog.findMany({
      where: { createdAt: { gte: new Date(now - 24 * 3600000) } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const pollLogsByVehicle = new Map<string, typeof recentPollLogs>();
    const globalPollLogs: typeof recentPollLogs = [];
    for (const log of recentPollLogs) {
      if (log.vehicleId) {
        const arr = pollLogsByVehicle.get(log.vehicleId) ?? [];
        arr.push(log);
        pollLogsByVehicle.set(log.vehicleId, arr);
      } else {
        globalPollLogs.push(log);
      }
    }

    const pollSuccessCount = recentPollLogs.filter(l => l.status === 'SUCCESS').length;
    const pollFailureCount = recentPollLogs.filter(l => l.status === 'FAILURE').length;
    const pollTimeoutCount = recentPollLogs.filter(l => l.status === 'TIMEOUT').length;
    const lastFailure = recentPollLogs.find(l => l.status === 'FAILURE' || l.status === 'TIMEOUT');

    const items = vehicles.map(v => {
      const dv = v.dimoVehicle;
      const ls = v.latestState;
      const raw = (dv?.rawJson ?? {}) as Record<string, any>;
      const aftermarket = raw?.aftermarketDevice as { serial?: string; pairedAt?: string } | undefined;
      const synthetic = raw?.syntheticDevice as { tokenId?: number } | undefined;

      const hasAftermarket = aftermarket?.serial != null;
      const hasSynthetic = synthetic?.tokenId != null;
      const connectionType = hasAftermarket ? 'Aftermarket Device' : hasSynthetic ? 'Synthetic Device' : dv ? 'DIMO' : 'Not Connected';
      const sourceType = hasAftermarket ? 'OBD-II' : hasSynthetic ? 'API / Software' : dv ? 'DIMO Platform' : null;

      const lastSeenAt = ls?.lastSeenAt ?? dv?.lastSignal ?? null;
      const lastSyncedAt = dv?.syncedAt ?? null;

      const rawSignals = (ls?.rawPayloadJson ?? null) as Record<string, unknown> | null;
      const conn = extractConnectivitySnapshot(rawSignals ?? undefined);

      let freshnessLabel = 'Unknown';
      let diffMs = -1;
      if (lastSeenAt) {
        diffMs = now - new Date(lastSeenAt).getTime();
        const mins = diffMs / 60000;
        if (mins < 5) freshnessLabel = 'Live';
        else if (mins < 60) freshnessLabel = `${Math.round(mins)} min ago`;
        else if (mins < 1440) freshnessLabel = `${Math.round(mins / 60)}h ago`;
        else freshnessLabel = `${Math.round(mins / 1440)}d ago`;
      }

      let connectionStatus: 'online' | 'standby' | 'offline' | 'not_connected';
      let statusNote: string;

      if (!dv) {
        connectionStatus = 'not_connected';
        statusNote = 'Vehicle is not linked to a DIMO data source';
      } else if (diffMs >= 0 && diffMs < 900000) {
        connectionStatus = 'online';
        statusNote = 'Signals are being received normally';
      } else if (diffMs >= 0 && diffMs < 86400000) {
        connectionStatus = 'standby';
        statusNote = 'No very recent activity — vehicle may be parked or inactive';
      } else if (diffMs >= 86400000) {
        const days = Math.round(diffMs / 86400000);
        connectionStatus = 'offline';
        statusNote = days > 7
          ? 'No signals for an extended period — connection may be lost or device may no longer be sending data'
          : 'No recent signals — connection may be interrupted';
      } else {
        connectionStatus = 'offline';
        statusNote = 'No signal data available';
      }

      const vehiclePollLogs = pollLogsByVehicle.get(v.id) ?? [];
      const lastPollSuccess = vehiclePollLogs.find(l => l.status === 'SUCCESS');
      const lastPollFailure = vehiclePollLogs.find(l => l.status === 'FAILURE' || l.status === 'TIMEOUT');
      const vehiclePollSuccesses = vehiclePollLogs.filter(l => l.status === 'SUCCESS').length;
      const vehiclePollFailures = vehiclePollLogs.filter(l => l.status !== 'SUCCESS').length;

      const hasLocation = ls?.latitude != null && ls?.longitude != null;
      const hasOdometer = ls?.odometerKm != null;
      const hasFuel = ls?.fuelLevelRelative != null;
      const hasEvSoc = ls?.evSoc != null;
      const hasSpeed = ls?.speedKmh != null;
      const hasBrakePad = ls?.brakePadPercent != null;
      const hasEngineOil = ls?.engineOilPercent != null;
      const hasCoolant = ls?.coolantTempC != null;
      const hasTirePressure = ls?.tireHealthPercent != null;
      const hasDtc = ls?.obdDtcList != null;

      const availableSignals: string[] = [];
      if (hasLocation) availableSignals.push('Location');
      if (hasOdometer) availableSignals.push('Odometer');
      if (hasFuel) availableSignals.push('Fuel Level');
      if (hasEvSoc) availableSignals.push('EV SoC');
      if (hasSpeed) availableSignals.push('Speed');
      if (hasBrakePad) availableSignals.push('Brake Pad');
      if (hasEngineOil) availableSignals.push('Engine Oil');
      if (hasCoolant) availableSignals.push('Coolant Temp');
      if (hasTirePressure) availableSignals.push('Tire Health');
      if (hasDtc) availableSignals.push('DTC');

      const signalCoverage = ls ? Math.round((availableSignals.length / 10) * 100) : 0;

      return {
        vehicleId: v.id,
        vin: v.vin,
        licensePlate: v.licensePlate ?? null,
        make: v.make,
        model: v.model,
        year: v.year,
        organizationId: v.organization?.id ?? null,
        organizationName: v.organization?.companyName ?? null,
        connectionType,
        sourceType,
        provider: 'DIMO',
        deviceSerial: aftermarket?.serial ?? null,
        syntheticTokenId: synthetic?.tokenId ?? null,
        dimoTokenId: dv?.tokenId ?? null,
        dimoConnectionStatus: dv?.connectionStatus ?? null,
        connectionStatus,
        statusNote,
        online: connectionStatus === 'online',
        lastSeenAt: lastSeenAt instanceof Date ? lastSeenAt.toISOString() : lastSeenAt,
        lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
        freshnessLabel,
        pairedAt: aftermarket?.pairedAt ?? dv?.createdAt?.toISOString() ?? null,
        latitude: ls?.latitude ?? null,
        longitude: ls?.longitude ?? null,
        odometerKm: ls?.odometerKm != null ? Math.floor(ls.odometerKm) : null,
        hasTelemetry: ls != null,
        obdIsPluggedIn: conn.obdIsPluggedIn,
        jammingDetectedCount: conn.jammingDetectedCount,
        jammingIncidents: conn.jammingIncidents,
        availableSignals,
        signalCoverage,
        diagnostics: {
          pollSuccess24h: vehiclePollSuccesses,
          pollFailure24h: vehiclePollFailures,
          lastPollSuccessAt: lastPollSuccess?.finishedAt?.toISOString() ?? null,
          lastPollFailureAt: lastPollFailure?.createdAt?.toISOString() ?? null,
          lastPollError: lastPollFailure?.errorMessage ?? null,
          lastPollDurationMs: lastPollSuccess?.durationMs ?? null,
        },
      };
    });

    const gatedItems = await Promise.all(
      items.map(async (item) => {
        if (!item.organizationId) {
          return { ...item, latitude: null, longitude: null };
        }
        const allowed = await this.liveGpsEnforcement.isVehicleGpsReadAllowed({
          organizationId: item.organizationId,
          vehicleId: item.vehicleId,
          purpose: LIVE_GPS_PURPOSE.TECHNICAL_OVERVIEW,
          serviceIdentity: LIVE_GPS_SERVICE_IDENTITY.MASTER_ADMIN_SUPPORT,
          correlationId: `master-admin-fleet:${item.vehicleId}`,
          supportAccess: true,
        });
        return allowed ? item : { ...item, latitude: null, longitude: null };
      }),
    );

    const onlineCount = gatedItems.filter(i => i.connectionStatus === 'online').length;
    const standbyCount = gatedItems.filter(i => i.connectionStatus === 'standby').length;
    const offlineCount = gatedItems.filter(i => i.connectionStatus === 'offline').length;
    const notConnected = gatedItems.filter(i => i.connectionStatus === 'not_connected').length;
    const withTelemetry = gatedItems.filter(i => i.hasTelemetry).length;
    const avgSignalCoverage = gatedItems.length > 0 ? Math.round(gatedItems.reduce((s, i) => s + i.signalCoverage, 0) / gatedItems.length) : 0;

    return {
      summary: {
        total: gatedItems.length,
        online: onlineCount,
        standby: standbyCount,
        offline: offlineCount,
        notConnected,
        withTelemetry,
        avgSignalCoverage,
      },
      pollHealth: {
        success24h: pollSuccessCount,
        failure24h: pollFailureCount,
        timeout24h: pollTimeoutCount,
        successRate: (pollSuccessCount + pollFailureCount + pollTimeoutCount) > 0
          ? Math.round(pollSuccessCount / (pollSuccessCount + pollFailureCount + pollTimeoutCount) * 100)
          : null,
        lastFailureAt: lastFailure?.createdAt?.toISOString() ?? null,
        lastFailureError: lastFailure?.errorMessage ?? null,
        lastFailureJobType: lastFailure?.jobType ?? null,
      },
      vehicles: gatedItems,
    };
  }

  @Post('query')
  async queryGraphQL(@Body() body: { tokenId: number; query: string }) {
    if (!body.tokenId || !body.query) {
      throw new BadRequestException('tokenId and query are required');
    }
    try {
      const jwt = await this.dimoAuth.getVehicleJwt(body.tokenId);
      const result = await this.dimoTelemetry.queryGraphQL(jwt, body.query);
      return result;
    } catch (err: any) {
      throw new BadRequestException(err.message || 'GraphQL query failed');
    }
  }
}
