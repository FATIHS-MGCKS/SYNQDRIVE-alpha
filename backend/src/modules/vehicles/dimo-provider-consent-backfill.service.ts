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

interface FleetIdentityIndex {
  dimoVehicleIdOwners: Map<string, string>;
  tokenIdOwners: Map<number, string>;
}

interface ApplyTimeSnapshot {
  vehicleId: string;
  organizationId: string;
  dimoVehicleId: string;
  dimoTokenId: number;
  dimoExternalId: string;
  activeDimoLinkId: string;
  linkDimoVehicleId: string;
  linkConsentId: string | null;
  activeConsentIds: string[];
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
      plans.push(
        this.planForVehicle(vehicle, input.organizationId, fleetIdentity, runId),
      );
    }

    return plans;
  }

  async run(input: RunDimoConsentBackfillInput): Promise<DimoConsentBackfillSummary> {
    const runId = input.runId ?? `dimo-consent-backfill-${Date.now()}`;
    const plans = await this.plan(input, runId);
    let applied = 0;

    if (input.apply) {
      applied = await this.applyPlansAtomic(input.organizationId, plans, runId);
    }

    return this.summarize(input.apply ? 'apply' : 'dry-run', input.organizationId, runId, plans, applied);
  }

  /**
   * Atomic apply semantics:
   * 1. Abort without writes if any plan is SKIP/CONFLICT.
   * 2. Preflight identity for every CREATE plan; abort all if any fails.
   * 3. Execute all CREATE + consentId WIRE operations in one DB transaction.
   * 4. Post-verify row counts and FK wiring inside the same transaction.
   */
  private async applyPlansAtomic(
    requestedOrganizationId: string,
    plans: DimoConsentBackfillVehiclePlan[],
    runId: string,
  ): Promise<number> {
    const blocking = plans.filter(
      (p) => p.plannedAction === 'CONFLICT' || p.plannedAction === 'SKIP',
    );
    if (blocking.length > 0) {
      throw new ConflictException({
        code: 'DIMO_CONSENT_BACKFILL_APPLY_BLOCKED',
        message: 'Apply aborted: one or more targets are CONFLICT or SKIP',
        vehicles: blocking.map((p) => ({
          vehicleId: p.vehicleId,
          plannedAction: p.plannedAction,
          reason: p.reason,
        })),
      });
    }

    const mutatePlans = plans.filter((p) => p.plannedAction === 'CREATE');
    if (mutatePlans.length === 0) {
      return 0;
    }

    const snapshots = new Map<string, ApplyTimeSnapshot>();
    for (const plan of mutatePlans) {
      const snapshot = await this.loadApplyTimeSnapshot(
        requestedOrganizationId,
        plan.vehicleId,
      );
      this.assertApplyTimeIdentity(plan, snapshot, requestedOrganizationId);
      snapshots.set(plan.vehicleId, snapshot);
    }

    const fleetIdentity = await this.loadFleetIdentityIndex(requestedOrganizationId);

    return this.prisma.$transaction(async (tx) => {
      const createdConsentIds = new Map<string, string>();

      for (const plan of mutatePlans) {
        const snapshot = snapshots.get(plan.vehicleId)!;
        this.assertApplyTimeIdentity(plan, snapshot, requestedOrganizationId, fleetIdentity);

        if (snapshot.activeConsentIds.length > 0) {
          throw new ConflictException({
            code: 'DIMO_CONSENT_BACKFILL_CONSENT_EXISTS',
            message: 'ACTIVE consent appeared between plan and apply',
            vehicleId: plan.vehicleId,
          });
        }

        if (!plan.proposedConsent) {
          throw new ConflictException({
            code: 'DIMO_CONSENT_BACKFILL_MISSING_PROPOSAL',
            message: 'Missing proposed consent payload',
            vehicleId: plan.vehicleId,
          });
        }

        if (snapshot.linkConsentId != null) {
          throw new ConflictException({
            code: 'DIMO_CONSENT_BACKFILL_UNEXPECTED_LINK_CONSENT',
            message: 'Unexpected link.consentId appeared before apply',
            vehicleId: plan.vehicleId,
            consentId: snapshot.linkConsentId,
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

        createdConsentIds.set(plan.vehicleId, created.id);

        await tx.vehicleDataSourceLink.update({
          where: { id: snapshot.activeDimoLinkId },
          data: { consentId: created.id },
        });
      }

      await this.verifyPostWrite(tx, requestedOrganizationId, mutatePlans, createdConsentIds, runId);

      return mutatePlans.length;
    });
  }

  private async loadApplyTimeSnapshot(
    requestedOrganizationId: string,
    vehicleId: string,
  ): Promise<ApplyTimeSnapshot> {
    const row = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: requestedOrganizationId },
      select: {
        id: true,
        organizationId: true,
        dimoVehicleId: true,
        dimoVehicle: { select: { tokenId: true, externalId: true } },
        dataSourceLinks: {
          where: {
            provider: DIMO_DATA_SOURCE_PROVIDER,
            isActive: true,
            dimoVehicleId: { not: null },
          },
          select: { id: true, dimoVehicleId: true, consentId: true, provider: true, isActive: true },
        },
        providerConsents: {
          where: {
            provider: DIMO_DATA_SOURCE_PROVIDER,
            status: VehicleProviderConsentStatus.ACTIVE,
          },
          select: { id: true },
        },
      },
    });

    if (!row || !row.dimoVehicleId || !row.dimoVehicle?.tokenId || !row.dimoVehicle.externalId) {
      throw new ConflictException({
        code: 'DIMO_CONSENT_BACKFILL_VEHICLE_NOT_FOUND',
        message: 'Vehicle not found or missing DIMO identity at apply time',
        vehicleId,
      });
    }

    if (row.dataSourceLinks.length !== 1) {
      throw new ConflictException({
        code: 'DIMO_CONSENT_BACKFILL_ACTIVE_LINK_CARDINALITY',
        message: `Expected exactly one active DIMO link, found ${row.dataSourceLinks.length}`,
        vehicleId,
      });
    }

    const link = row.dataSourceLinks[0]!;

    return {
      vehicleId: row.id,
      organizationId: row.organizationId,
      dimoVehicleId: row.dimoVehicleId,
      dimoTokenId: row.dimoVehicle.tokenId,
      dimoExternalId: row.dimoVehicle.externalId,
      activeDimoLinkId: link.id,
      linkDimoVehicleId: link.dimoVehicleId!,
      linkConsentId: link.consentId,
      activeConsentIds: row.providerConsents.map((c) => c.id),
    };
  }

  private assertApplyTimeIdentity(
    plan: DimoConsentBackfillVehiclePlan,
    snapshot: ApplyTimeSnapshot,
    requestedOrganizationId: string,
    fleetIdentity?: FleetIdentityIndex,
  ): void {
    const fail = (code: string, message: string, extra?: Record<string, unknown>): never => {
      throw new ConflictException({ code, message, vehicleId: plan.vehicleId, ...extra });
    };

    if (snapshot.organizationId !== requestedOrganizationId) {
      fail('DIMO_CONSENT_BACKFILL_ORG_MISMATCH', 'Vehicle organization mismatch at apply time');
    }
    if (plan.organizationId !== requestedOrganizationId) {
      fail('DIMO_CONSENT_BACKFILL_PLAN_ORG_MISMATCH', 'Plan organization mismatch');
    }
    if (snapshot.vehicleId !== plan.vehicleId) {
      fail('DIMO_CONSENT_BACKFILL_VEHICLE_MISMATCH', 'Vehicle id mismatch at apply time');
    }
    if (snapshot.activeDimoLinkId !== plan.activeDimoLinkId) {
      fail('DIMO_CONSENT_BACKFILL_LINK_CHANGED', 'Active DIMO link identity changed since dry-run');
    }
    if (snapshot.dimoVehicleId !== plan.dimoVehicleId) {
      fail('DIMO_CONSENT_BACKFILL_DIMO_VEHICLE_CHANGED', 'dimoVehicleId changed since dry-run');
    }
    if (snapshot.linkDimoVehicleId !== plan.dimoVehicleId) {
      fail('DIMO_CONSENT_BACKFILL_LINK_DIMO_VEHICLE_CHANGED', 'Link dimoVehicleId mismatch');
    }
    if (snapshot.dimoTokenId !== plan.dimoTokenId) {
      fail('DIMO_CONSENT_BACKFILL_TOKEN_CHANGED', 'DIMO tokenId changed since dry-run');
    }
    if (snapshot.dimoExternalId !== plan.dimoExternalId) {
      fail('DIMO_CONSENT_BACKFILL_EXTERNAL_ID_CHANGED', 'DIMO externalId changed since dry-run');
    }
    if (String(snapshot.dimoTokenId) !== snapshot.dimoExternalId) {
      fail('DIMO_CONSENT_BACKFILL_TOKEN_EXTERNAL_MISMATCH', 'tokenId does not map to externalId');
    }
    if (snapshot.activeConsentIds.length > 1) {
      fail('DIMO_CONSENT_BACKFILL_MULTIPLE_ACTIVE_CONSENTS', 'Multiple ACTIVE DIMO consents at apply time');
    }

    if (fleetIdentity) {
      if (fleetIdentity.dimoVehicleIdOwners.get(snapshot.dimoVehicleId) !== snapshot.vehicleId) {
        fail('DIMO_CONSENT_BACKFILL_DIMO_VEHICLE_COLLISION', 'dimoVehicleId collision in org');
      }
      if (fleetIdentity.tokenIdOwners.get(snapshot.dimoTokenId) !== snapshot.vehicleId) {
        fail('DIMO_CONSENT_BACKFILL_TOKEN_COLLISION', 'tokenId collision in org');
      }
    }
  }

  private async verifyPostWrite(
    tx: Prisma.TransactionClient,
    requestedOrganizationId: string,
    mutatePlans: DimoConsentBackfillVehiclePlan[],
    createdConsentIds: Map<string, string>,
    runId: string,
  ): Promise<void> {
    if (createdConsentIds.size !== mutatePlans.length) {
      throw new ConflictException({
        code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_COUNT',
        message: 'Post-write consent count mismatch',
      });
    }

    for (const plan of mutatePlans) {
      const consentId = createdConsentIds.get(plan.vehicleId);
      if (!consentId) {
        throw new ConflictException({
          code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_MISSING_CONSENT',
          message: 'Created consent id missing for vehicle',
          vehicleId: plan.vehicleId,
        });
      }

      const consent = await tx.vehicleProviderConsent.findFirst({
        where: {
          id: consentId,
          vehicleId: plan.vehicleId,
          organizationId: requestedOrganizationId,
          provider: DIMO_DATA_SOURCE_PROVIDER,
          status: VehicleProviderConsentStatus.ACTIVE,
        },
      });
      if (!consent) {
        throw new ConflictException({
          code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_CONSENT_ROW',
          message: 'Post-write consent row verification failed',
          vehicleId: plan.vehicleId,
        });
      }

      const metadata = consent.metadataJson as Record<string, unknown> | null;
      if (metadata?.dimoTokenId !== plan.dimoTokenId) {
        throw new ConflictException({
          code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_METADATA',
          message: 'Post-write metadata dimoTokenId mismatch',
          vehicleId: plan.vehicleId,
        });
      }
      if (metadata?.runId !== runId) {
        throw new ConflictException({
          code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_RUNID',
          message: 'Post-write metadata runId mismatch',
          vehicleId: plan.vehicleId,
        });
      }

      const link = await tx.vehicleDataSourceLink.findFirst({
        where: {
          id: plan.activeDimoLinkId,
          vehicleId: plan.vehicleId,
          provider: DIMO_DATA_SOURCE_PROVIDER,
          isActive: true,
          dimoVehicleId: plan.dimoVehicleId,
        },
      });
      if (!link || link.consentId !== consentId) {
        throw new ConflictException({
          code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_LINK_FK',
          message: 'Post-write link.consentId verification failed',
          vehicleId: plan.vehicleId,
        });
      }
    }
  }

  private planForVehicle(
    vehicle: Awaited<ReturnType<DimoProviderConsentBackfillService['loadTargetVehicles']>>[number],
    requestedOrganizationId: string,
    identityIndex: FleetIdentityIndex,
    runId: string,
  ): DimoConsentBackfillVehiclePlan {
    const activeDimoLinks = vehicle.dataSourceLinks.filter(
      (l) => l.provider === DIMO_DATA_SOURCE_PROVIDER && l.isActive && l.dimoVehicleId != null,
    );
    const activeDimoLink = activeDimoLinks.length === 1 ? activeDimoLinks[0]! : null;
    const dimoVehicle = vehicle.dimoVehicle;
    const tokenId = dimoVehicle?.tokenId ?? null;
    const externalId = dimoVehicle?.externalId ?? null;
    const activeConsents = vehicle.providerConsents.filter((c) => c.status === 'ACTIVE');
    const activeConsent = activeConsents[0] ?? null;
    const nonActiveConsent = vehicle.providerConsents.find((c) => c.status !== 'ACTIVE') ?? null;

    const vehicleInRequestedOrg = vehicle.organizationId === requestedOrganizationId;

    const identityChecks = {
      vehicleInOrg: vehicleInRequestedOrg,
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
      dimoVehicleId: vehicle.dimoVehicleId ?? '',
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

    if (!vehicleInRequestedOrg) {
      return {
        ...base,
        plannedAction: 'CONFLICT',
        plannedLinkAction: null,
        reason: 'vehicle_organization_mismatch',
      };
    }

    if (activeDimoLinks.length === 0) {
      return {
        ...base,
        plannedAction: 'CONFLICT',
        plannedLinkAction: null,
        reason: 'no_active_dimo_link',
      };
    }

    if (activeDimoLinks.length > 1) {
      return {
        ...base,
        plannedAction: 'CONFLICT',
        plannedLinkAction: null,
        reason: 'multiple_active_dimo_links',
      };
    }

    const link = activeDimoLinks[0]!;

    if (!dimoVehicle || tokenId == null || !externalId || !vehicle.dimoVehicleId) {
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

    if (activeConsents.length > 1) {
      return {
        ...base,
        plannedAction: 'CONFLICT',
        plannedLinkAction: null,
        reason: 'multiple_active_dimo_consents',
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
      if (link.consentId === activeConsent.id) {
        return {
          ...base,
          plannedAction: 'NOOP',
          plannedLinkAction: 'NOOP',
          reason: 'active_consent_and_link_already_wired',
        };
      }
      if (link.consentId && link.consentId !== activeConsent.id) {
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
          linkId: link.id,
          currentConsentId: link.consentId,
          proposedConsentIdBinding: 'existing-active-consent-id',
        },
      };
    }

    if (link.consentId != null) {
      return {
        ...base,
        plannedAction: 'CONFLICT',
        plannedLinkAction: 'CONFLICT',
        reason: 'unexpected_link_consent_id_without_active_consent',
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
        linkId: link.id,
        currentConsentId: link.consentId,
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

  private async loadFleetIdentityIndex(organizationId: string): Promise<FleetIdentityIndex> {
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
      atomicApply: true,
      partialWritePossible: false,
      vehicles: plans,
    };
  }
}
