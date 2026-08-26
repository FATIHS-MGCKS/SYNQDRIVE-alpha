import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  VehicleProviderConsentGrantType,
  VehicleProviderConsentStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DIMO_DATA_SOURCE_PROVIDER } from '@modules/dimo/dimo-vehicle-data-source-link.contract';
import {
  DimoConsentBackfillSummary,
  DimoConsentBackfillVehiclePlan,
  type DimoConsentBackfillProposedConsent,
} from './dimo-provider-consent-backfill.types';

const CANONICAL_DIMO_SCOPES = ['telemetry', 'location', 'dtc', 'snapshot'] as const;

export interface PlanDimoConsentBackfillInput {
  organizationId: string;
  vehicleIds: string[];
}

export interface RunDimoConsentBackfillInput extends PlanDimoConsentBackfillInput {
  apply: boolean;
  runId?: string;
}

@Injectable()
export class DimoProviderConsentBackfillService {
  constructor(private readonly prisma: PrismaService) {}

  async plan(
    input: PlanDimoConsentBackfillInput,
    runId: string = 'dry-run',
  ): Promise<DimoConsentBackfillVehiclePlan[]> {
    const vehicles = await this.loadTargetVehicles(input.organizationId, input.vehicleIds);
    const fleetIdentity = await this.loadFleetIdentityIndex(input.organizationId);
    const plans: DimoConsentBackfillVehiclePlan[] = [];

    for (const vehicleId of input.vehicleIds) {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      if (!vehicle) {
        plans.push(this.skipPlan(vehicleId, input.organizationId, 'vehicle_not_found_in_org'));
        continue;
      }
      plans.push(this.planForVehicle(vehicle, fleetIdentity, runId));
    }

    return plans;
  }

  async run(input: RunDimoConsentBackfillInput): Promise<DimoConsentBackfillSummary> {
    const runId = input.runId ?? `dimo-consent-backfill-${Date.now()}`;
    const plans = await this.plan(input, runId);
    let applied = 0;

    if (input.apply) {
      for (const plan of plans) {
        if (plan.plannedAction === 'CONFLICT' || plan.plannedAction === 'SKIP') {
          continue;
        }
        const didApply = await this.applyPlan(plan, runId);
        if (didApply) applied += 1;
      }
    }

    return this.summarize(input.apply ? 'apply' : 'dry-run', input.organizationId, runId, plans, applied);
  }

  private async applyPlan(plan: DimoConsentBackfillVehiclePlan, runId: string): Promise<boolean> {
    if (plan.plannedAction === 'NOOP') {
      return false;
    }

    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.vehicle.findFirst({
        where: { id: plan.vehicleId, organizationId: plan.organizationId },
        select: {
          id: true,
          providerConsents: {
            where: { provider: DIMO_DATA_SOURCE_PROVIDER, status: VehicleProviderConsentStatus.ACTIVE },
            orderBy: { grantedAt: 'desc' },
            take: 1,
            select: { id: true },
          },
          dataSourceLinks: {
            where: {
              provider: DIMO_DATA_SOURCE_PROVIDER,
              isActive: true,
              dimoVehicleId: { not: null },
            },
            select: { id: true, consentId: true },
          },
        },
      });

      if (!fresh) {
        throw new NotFoundException(`Vehicle ${plan.vehicleId} not found at apply time`);
      }

      const activeLink = fresh.dataSourceLinks[0];
      if (!activeLink || activeLink.id !== plan.activeDimoLinkId) {
        throw new ConflictException({
          code: 'DIMO_CONSENT_BACKFILL_LINK_CHANGED',
          message: 'Active DIMO link identity changed since dry-run',
        });
      }

      let consentId = fresh.providerConsents[0]?.id ?? null;

      if (plan.plannedAction === 'CREATE') {
        if (consentId) {
          throw new ConflictException({
            code: 'DIMO_CONSENT_BACKFILL_CONSENT_EXISTS',
            message: 'ACTIVE consent appeared between plan and apply',
          });
        }
        if (!plan.proposedConsent) {
          throw new ConflictException({
            code: 'DIMO_CONSENT_BACKFILL_MISSING_PROPOSAL',
            message: 'Missing proposed consent payload',
          });
        }

        const created = await tx.vehicleProviderConsent.create({
          data: {
            vehicleId: plan.proposedConsent.vehicleId,
            organizationId: plan.proposedConsent.organizationId,
            provider: plan.proposedConsent.provider,
            grantType: VehicleProviderConsentGrantType.DIMO_DIRECT,
            status: VehicleProviderConsentStatus.ACTIVE,
            scopes: [...plan.proposedConsent.scopes],
            providerVehicleRef: plan.proposedConsent.providerVehicleRef,
            grantedByUserId: null,
            grantedAt: new Date(plan.proposedConsent.grantedAt),
            expiresAt: null,
            revokedAt: null,
            metadataJson: plan.proposedConsent.metadataJson as Prisma.InputJsonValue,
          },
        });
        consentId = created.id;
      }

      if (
        plan.plannedLinkAction === 'WIRE_CONSENT_ID' &&
        consentId &&
        activeLink.consentId !== consentId
      ) {
        if (activeLink.consentId && activeLink.consentId !== consentId) {
          throw new ConflictException({
            code: 'DIMO_CONSENT_BACKFILL_LINK_CONSENT_MISMATCH',
            message: 'Link consentId populated with unexpected value',
          });
        }
        await tx.vehicleDataSourceLink.update({
          where: { id: activeLink.id },
          data: { consentId },
        });
      }

      return plan.plannedAction === 'CREATE' || plan.plannedLinkAction === 'WIRE_CONSENT_ID';
    });
  }

  private planForVehicle(
    vehicle: Awaited<ReturnType<DimoProviderConsentBackfillService['loadTargetVehicles']>>[number],
    identityIndex: Awaited<ReturnType<DimoProviderConsentBackfillService['loadFleetIdentityIndex']>>,
    runId: string,
  ): DimoConsentBackfillVehiclePlan {
    const activeDimoLink = vehicle.dataSourceLinks.find(
      (l) => l.provider === DIMO_DATA_SOURCE_PROVIDER && l.isActive && l.dimoVehicleId != null,
    );
    const dimoVehicle = vehicle.dimoVehicle;
    const tokenId = dimoVehicle?.tokenId ?? null;
    const externalId = dimoVehicle?.externalId ?? null;
    const activeConsent = vehicle.providerConsents.find((c) => c.status === 'ACTIVE') ?? null;
    const nonActiveConsent = vehicle.providerConsents.find((c) => c.status !== 'ACTIVE') ?? null;

    const identityChecks = {
      vehicleInOrg: vehicle.organizationId === vehicle.organizationId,
      linkInOrg: !!activeDimoLink,
      linkIsDimo: activeDimoLink?.provider === DIMO_DATA_SOURCE_PROVIDER,
      linkHasDimoVehicleId: !!activeDimoLink?.dimoVehicleId,
      tokenMapsToVehicle:
        tokenId != null &&
        externalId != null &&
        String(tokenId) === externalId &&
        activeDimoLink?.dimoVehicleId === vehicle.dimoVehicleId,
      dimoVehicleIdUnique:
        vehicle.dimoVehicleId != null &&
        identityIndex.dimoVehicleIdOwners.get(vehicle.dimoVehicleId) === vehicle.id,
      tokenIdUnique:
        tokenId != null && identityIndex.tokenIdOwners.get(tokenId) === vehicle.id,
    };

    const base = {
      vehicleId: vehicle.id,
      vehicleRef: vehicle.licensePlate ?? vehicle.id,
      organizationId: vehicle.organizationId,
      dimoVehicleId: vehicle.dimoVehicleId!,
      dimoTokenId: tokenId ?? 0,
      dimoExternalId: externalId ?? '',
      activeDimoLinkId: activeDimoLink?.id ?? '',
      currentConsentCount: vehicle.providerConsents.length,
      currentActiveConsentId: activeConsent?.id ?? null,
      currentLinkConsentId: activeDimoLink?.consentId ?? null,
      identityChecks,
      proposedConsent: null as DimoConsentBackfillProposedConsent | null,
      proposedLinkUpdate: null as DimoConsentBackfillVehiclePlan['proposedLinkUpdate'],
    };

    if (!activeDimoLink || !dimoVehicle || tokenId == null || !externalId) {
      return {
        ...base,
        plannedAction: 'CONFLICT',
        plannedLinkAction: null,
        reason: 'missing_active_dimo_link_or_token_identity',
      };
    }

    if (
      !identityChecks.dimoVehicleIdUnique ||
      !identityChecks.tokenIdUnique ||
      !identityChecks.tokenMapsToVehicle
    ) {
      return {
        ...base,
        plannedAction: 'CONFLICT',
        plannedLinkAction: null,
        reason: 'identity_collision_or_token_mismatch',
      };
    }

    if (nonActiveConsent && !activeConsent) {
      return {
        ...base,
        plannedAction: 'CONFLICT',
        plannedLinkAction: null,
        reason: 'inactive_consent_requires_manual_review',
      };
    }

    if (activeConsent) {
      if (activeDimoLink.consentId === activeConsent.id) {
        return {
          ...base,
          plannedAction: 'NOOP',
          plannedLinkAction: 'NOOP',
          reason: 'active_consent_and_link_already_wired',
        };
      }
      if (activeDimoLink.consentId && activeDimoLink.consentId !== activeConsent.id) {
        return {
          ...base,
          plannedAction: 'CONFLICT',
          plannedLinkAction: 'CONFLICT',
          reason: 'link_consent_id_mismatch_with_active_consent',
        };
      }
      return {
        ...base,
        plannedAction: 'NOOP',
        plannedLinkAction: 'WIRE_CONSENT_ID',
        reason: 'active_consent_exists_link_unwired',
        proposedLinkUpdate: {
          linkId: activeDimoLink.id,
          currentConsentId: activeDimoLink.consentId,
          proposedConsentIdBinding: 'existing-active-consent-id',
        },
      };
    }

    const proposedConsent = this.buildProposedConsent(vehicle, dimoVehicle, runId);
    return {
      ...base,
      plannedAction: 'CREATE',
      plannedLinkAction: 'WIRE_CONSENT_ID',
      reason: 'missing_active_dimo_consent_with_valid_mapping',
      proposedConsent,
      proposedLinkUpdate: {
        linkId: activeDimoLink.id,
        currentConsentId: activeDimoLink.consentId,
        proposedConsentIdBinding: 'new-consent-id',
      },
    };
  }

  buildProposedConsent(
    vehicle: {
      id: string;
      organizationId: string;
      vin: string | null;
      createdAt: Date;
      dimoVehicleId: string | null;
    },
    dimoVehicle: { tokenId: number | null; externalId: string | null },
    runId: string,
  ): DimoConsentBackfillProposedConsent {
    const tokenId = dimoVehicle.tokenId!;
    const externalId = dimoVehicle.externalId ?? String(tokenId);
    return {
      vehicleId: vehicle.id,
      organizationId: vehicle.organizationId,
      provider: 'DIMO',
      grantType: 'DIMO_DIRECT',
      status: 'ACTIVE',
      scopes: [...CANONICAL_DIMO_SCOPES],
      providerVehicleRef: externalId,
      metadataJson: {
        dimoTokenId: tokenId,
        dimoExternalId: externalId,
        dimoVehicleId: vehicle.dimoVehicleId,
        registeredVin: vehicle.vin,
        provenance: 'backfill',
        runId,
      },
      grantedAt: vehicle.createdAt.toISOString(),
      expiresAt: null,
      revokedAt: null,
      grantedByUserId: null,
    };
  }

  private skipPlan(
    vehicleId: string,
    organizationId: string,
    reason: string,
  ): DimoConsentBackfillVehiclePlan {
    return {
      vehicleId,
      vehicleRef: vehicleId,
      organizationId,
      dimoVehicleId: '',
      dimoTokenId: 0,
      dimoExternalId: '',
      activeDimoLinkId: '',
      currentConsentCount: 0,
      currentActiveConsentId: null,
      currentLinkConsentId: null,
      plannedAction: 'SKIP',
      plannedLinkAction: null,
      reason,
      proposedConsent: null,
      proposedLinkUpdate: null,
      identityChecks: {
        vehicleInOrg: false,
        linkInOrg: false,
        linkIsDimo: false,
        linkHasDimoVehicleId: false,
        tokenMapsToVehicle: false,
        dimoVehicleIdUnique: false,
        tokenIdUnique: false,
      },
    };
  }

  private async loadTargetVehicles(organizationId: string, vehicleIds: string[]) {
    return this.prisma.vehicle.findMany({
      where: { organizationId, id: { in: vehicleIds } },
      select: {
        id: true,
        organizationId: true,
        licensePlate: true,
        vin: true,
        createdAt: true,
        dimoVehicleId: true,
        dimoVehicle: {
          select: { tokenId: true, externalId: true, connectionStatus: true },
        },
        dataSourceLinks: {
          select: {
            id: true,
            provider: true,
            isActive: true,
            dimoVehicleId: true,
            consentId: true,
          },
        },
        providerConsents: {
          where: { provider: DIMO_DATA_SOURCE_PROVIDER },
          orderBy: { grantedAt: 'desc' },
          select: { id: true, status: true },
        },
      },
    });
  }

  private async loadFleetIdentityIndex(organizationId: string) {
    const fleet = await this.prisma.vehicle.findMany({
      where: { organizationId, dimoVehicleId: { not: null } },
      select: {
        id: true,
        dimoVehicleId: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });
    const dimoVehicleIdOwners = new Map<string, string>();
    const tokenIdOwners = new Map<number, string>();
    for (const vehicle of fleet) {
      if (vehicle.dimoVehicleId) {
        dimoVehicleIdOwners.set(vehicle.dimoVehicleId, vehicle.id);
      }
      const tokenId = vehicle.dimoVehicle?.tokenId;
      if (tokenId != null) {
        tokenIdOwners.set(tokenId, vehicle.id);
      }
    }
    return { dimoVehicleIdOwners, tokenIdOwners };
  }

  private summarize(
    mode: 'dry-run' | 'apply',
    organizationId: string,
    runId: string,
    plans: DimoConsentBackfillVehiclePlan[],
    applied: number,
  ): DimoConsentBackfillSummary {
    return {
      mode,
      organizationId,
      runId,
      scanned: plans.length,
      create: plans.filter((p) => p.plannedAction === 'CREATE').length,
      wireConsentId: plans.filter((p) => p.plannedLinkAction === 'WIRE_CONSENT_ID').length,
      noop: plans.filter((p) => p.plannedAction === 'NOOP' && p.plannedLinkAction === 'NOOP').length,
      conflict: plans.filter((p) => p.plannedAction === 'CONFLICT').length,
      skip: plans.filter((p) => p.plannedAction === 'SKIP').length,
      applied,
      vehicles: plans,
    };
  }
}
