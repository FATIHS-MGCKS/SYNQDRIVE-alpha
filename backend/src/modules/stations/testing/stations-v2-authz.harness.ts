import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StationStatus } from '@prisma/client';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { STATION_SCOPE_CONTEXT_KEY } from '@shared/stations/station-scope.constants';
import type { StationsV2PermissionAction } from '@shared/auth/stations-v2-permission.constants';
import { StationsAccessService } from '../stations-access.service';
import { StationsPermissionGuard } from '../guards/stations-permission.guard';
import { StationsUpdatePermissionGuard } from '../guards/stations-update-permission.guard';
import { StationsSetPrimaryPermissionGuard } from '../guards/stations-set-primary-permission.guard';
import { StationsAssignVehiclePermissionGuard } from '../guards/stations-assign-vehicle-permission.guard';
import { StationsVehicleLocationPermissionGuard } from '../guards/stations-vehicle-location-permission.guard';
import { StationsChangeVehicleHomePermissionGuard } from '../guards/stations-change-vehicle-home-permission.guard';
import { StationScopeGuard } from '@shared/guards/station-scope.guard';
import { STATIONS_PERMISSION_KEY } from '../decorators/require-stations-permission.decorator';
import { STATION_SCOPE_KEY } from '@shared/decorators/station-scope.decorator';
import type { AuthzEndpointCase, AuthzPersona } from './stations-v2-authz.fixtures';
import {
  AUTHZ_ORG_A,
  AUTHZ_ORG_B,
  AUTHZ_STATION_A,
  AUTHZ_STATION_B,
  AUTHZ_STATION_ARCHIVED,
  AUTHZ_STATION_MISSING,
  AUTHZ_VEHICLE,
  stationStatusRecord,
} from './stations-v2-authz.fixtures';

type HarnessRequest = {
  method: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  user: Record<string, unknown>;
  [key: string]: unknown;
};

export class StationsV2AuthzHarness {
  readonly prisma = {
    organizationMembership: { findFirst: jest.fn() },
    station: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
  };

  readonly stationsAccess = new StationsAccessService(this.prisma as never);
  readonly stationScopeService = new StationScopeService(this.prisma as never);
  readonly reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;

  readonly permissionGuard = new StationsPermissionGuard(this.reflector, this.stationsAccess);
  readonly scopeGuard = new StationScopeGuard(this.reflector, this.stationScopeService);
  readonly updateGuard = new StationsUpdatePermissionGuard(this.stationsAccess);
  readonly setPrimaryGuard = new StationsSetPrimaryPermissionGuard(this.stationsAccess);
  readonly assignGuard = new StationsAssignVehiclePermissionGuard(this.stationsAccess);
  readonly vehicleLocationGuard = new StationsVehicleLocationPermissionGuard(this.stationsAccess);
  readonly changeVehicleHomeGuard = new StationsChangeVehicleHomePermissionGuard(this.stationsAccess);

  reset(): void {
    jest.clearAllMocks();
    this.seedDefaultStations();
  }

  seedDefaultStations(): void {
    this.prisma.station.findFirst.mockImplementation(async (args: { where: { id?: string; organizationId?: string } }) => {
      const id = args.where.id;
      const orgId = args.where.organizationId;
      if (!id) return null;

      if (id === AUTHZ_STATION_A && orgId === AUTHZ_ORG_A) {
        return { status: StationStatus.ACTIVE };
      }
      if (id === AUTHZ_STATION_B && orgId === AUTHZ_ORG_A) {
        return { status: StationStatus.ACTIVE };
      }
      if (id === AUTHZ_STATION_ARCHIVED && orgId === AUTHZ_ORG_A) {
        return { status: StationStatus.ARCHIVED };
      }
      if (id === AUTHZ_STATION_MISSING) {
        return null;
      }
      if (orgId === AUTHZ_ORG_A) {
        return null;
      }
      if (orgId === AUTHZ_ORG_B || !orgId) {
        if (id === AUTHZ_STATION_A || id === AUTHZ_STATION_B) {
          return { id };
        }
      }
      return null;
    });
  }

  setPersona(persona: AuthzPersona): void {
    this.prisma.organizationMembership.findFirst.mockImplementation(async (args: { where: { userId?: string; organizationId?: string } }) => {
      if (
        args.where.userId === persona.userId &&
        args.where.organizationId === persona.organizationId
      ) {
        return persona.membership;
      }
      return null;
    });
  }

  setVehicleLinkage(overrides: Partial<{
    homeStationId: string | null;
    currentStationId: string | null;
    expectedStationId: string | null;
  }> = {}): void {
    this.prisma.vehicle.findFirst.mockResolvedValue({
      homeStationId: AUTHZ_STATION_A,
      currentStationId: null,
      expectedStationId: null,
      ...overrides,
    });
  }

  buildRequest(
    persona: AuthzPersona,
    endpoint: AuthzEndpointCase,
    overrides: Partial<HarnessRequest> = {},
  ): HarnessRequest {
    return {
      method: endpoint.method,
      params: { orgId: persona.organizationId, ...(endpoint.params ?? {}) },
      query: {},
      body: endpoint.body ?? {},
      user: {
        id: persona.userId,
        organizationId: persona.organizationId,
      },
      ...overrides,
    };
  }

  private buildContext(request: HarnessRequest, handlerMeta?: Record<string, unknown>) {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handlerMeta ?? {},
      getClass: () => ({}),
    } as never;
  }

  private mockReflector(endpoint: AuthzEndpointCase): void {
    (this.reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === STATIONS_PERMISSION_KEY) return endpoint.permission;
      if (key === STATION_SCOPE_KEY) return endpoint.scope;
      return undefined;
    });
  }

  async runPermissionGate(endpoint: AuthzEndpointCase, request: HarnessRequest): Promise<void> {
    if (!endpoint.permission) return;
    this.mockReflector(endpoint);
    await this.permissionGuard.canActivate(this.buildContext(request));
  }

  async runSpecializedMutationGate(endpoint: AuthzEndpointCase, request: HarnessRequest): Promise<void> {
    const ctx = this.buildContext(request);
    switch (endpoint.specializedGuard) {
      case 'update':
        await this.updateGuard.canActivate(ctx);
        return;
      case 'setPrimary':
        await this.setPrimaryGuard.canActivate(ctx);
        return;
      case 'assignVehicle':
        await this.assignGuard.canActivate(ctx);
        return;
      case 'vehicleLocation':
        await this.vehicleLocationGuard.canActivate(ctx);
        return;
      case 'changeVehicleHome':
        await this.changeVehicleHomeGuard.canActivate(ctx);
        return;
      default:
        return;
    }
  }

  async runScopeGate(endpoint: AuthzEndpointCase, request: HarnessRequest): Promise<void> {
    this.mockReflector(endpoint);
    await this.scopeGuard.canActivate(this.buildContext(request));
  }

  async assertAllowed(endpoint: AuthzEndpointCase, persona: AuthzPersona, overrides?: Partial<HarnessRequest>): Promise<void> {
    this.setPersona(persona);
    this.setVehicleLinkage();
    const request = this.buildRequest(persona, endpoint, overrides);
    await this.runPermissionGate(endpoint, request);
    await this.runSpecializedMutationGate(endpoint, request);
    await this.runScopeGate(endpoint, request);
  }

  async assertDenied(
    endpoint: AuthzEndpointCase,
    persona: AuthzPersona,
    overrides?: Partial<HarnessRequest>,
  ): Promise<ForbiddenException | Record<string, unknown>> {
    this.setPersona(persona);
    this.setVehicleLinkage();
    const request = this.buildRequest(persona, endpoint, overrides);

    try {
      await this.runPermissionGate(endpoint, request);
      await this.runSpecializedMutationGate(endpoint, request);
      await this.runScopeGate(endpoint, request);
      throw new Error('Expected authorization failure');
    } catch (error) {
      if (error instanceof Error && error.message === 'Expected authorization failure') {
        throw error;
      }
      return error as ForbiddenException | Record<string, unknown>;
    }
  }

  expectDeniedCode(error: unknown, code: string): void {
    const response =
      error instanceof ForbiddenException
        ? (error.getResponse() as Record<string, unknown>)
        : (error as { response?: Record<string, unknown> }).response ?? error;
    expect(response).toEqual(
      expect.objectContaining({
        code,
      }),
    );
  }

  attachScope(request: HarnessRequest, endpoint: AuthzEndpointCase, persona: AuthzPersona) {
    this.setPersona(persona);
    return this.stationScopeService.enforceRequestScope(request, endpoint.scope);
  }

  getAttachedScope(request: HarnessRequest) {
    return request[STATION_SCOPE_CONTEXT_KEY];
  }
}

export { stationStatusRecord };
