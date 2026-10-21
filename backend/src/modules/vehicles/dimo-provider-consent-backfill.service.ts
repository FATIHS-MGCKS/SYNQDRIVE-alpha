import { ConflictException, Injectable } from '@nestjs/common';
import {
  Prisma,
  VehicleProviderConsentGrantType,
  VehicleProviderConsentStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DIMO_DATA_SOURCE_PROVIDER } from '@modules/dimo/dimo-vehicle-data-source-link.contract';
import {
  DimoConsentBackfillApplyResult,
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

type DbClient = PrismaService | Prisma.TransactionClient;

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
    const vehicles = await this.loadTargetVehicles(this.prisma, input.organizationId, input.vehicleIds);
    const fleetIdentity = await this.loadFleetIdentityIndex(this.prisma, input.organizationId);
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
    const applyResult: DimoConsentBackfillApplyResult = input.apply
      ? await this.applyPlansAtomic(input.organizationId, plans, runId)
      : this.emptyApplyResult(plans);

    return this.summarize(input.apply ? 'apply' : 'dry-run', input.organizationId, runId, plans, applyResult);
  }

  /**
   * Atomic apply semantics (authoritative gate is transaction-local):
   *
   * BEGIN TRANSACTION
   *   -> tx-local fleet identity read
   *   -> tx-local target reads for every mutation plan
   *   -> assert ALL targets (identity + cardinality) — no writes yet
   *   -> CREATE consents + WIRE links for all passing targets
   *   -> post-write verification
   * COMMIT
   *
   * Stale pre-transaction snapshots never authorize writes.
   */
  private async applyPlansAtomic(
    requestedOrganizationId: string,
    plans: DimoConsentBackfillVehiclePlan[],
    runId: string,
  ): Promise<DimoConsentBackfillApplyResult> {
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

    const mutationPlans = this.getMutationPlans(plans);
    if (mutationPlans.length === 0) {
      return this.emptyApplyResult(plans);
    }

    return this.prisma.$transaction(async (tx) => {
      const fleetIdentity = await this.loadFleetIdentityIndex(tx, requestedOrganizationId);

      const txSnapshots = new Map<string, ApplyTimeSnapshot>();
      for (const plan of mutationPlans) {
        const snapshot = await this.loadApplyTimeSnapshot(tx, requestedOrganizationId, plan.vehicleId);
        txSnapshots.set(plan.vehicleId, snapshot);
      }

      const wireConsentIds = new Map<string, string>();
      for (const plan of mutationPlans) {
        const snapshot = txSnapshots.get(plan.vehicleId)!;
        this.assertApplyTimeIdentity(plan, snapshot, requestedOrganizationId, fleetIdentity);

        if (plan.plannedAction === 'CREATE') {
          this.assertCreatePreflight(plan, snapshot);
        } else {
          const consentId = this.assertWireOnlyPreflight(plan, snapshot);
          wireConsentIds.set(plan.vehicleId, consentId);
        }
      }

      const createdConsentIds = new Map<string, string>();
      for (const plan of mutationPlans) {
        const snapshot = txSnapshots.get(plan.vehicleId)!;

        if (plan.plannedAction === 'CREATE') {
          if (!plan.proposedConsent) {
            throw new ConflictException({
              code: 'DIMO_CONSENT_BACKFILL_MISSING_PROPOSAL',
              message: 'Missing proposed consent payload',
              vehicleId: plan.vehicleId,
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
          wireConsentIds.set(plan.vehicleId, created.id);

          await tx.vehicleDataSourceLink.update({
            where: { id: snapshot.activeDimoLinkId },
            data: { consentId: created.id },
          });
        } else {
          const consentId = wireConsentIds.get(plan.vehicleId)!;
          await tx.vehicleDataSourceLink.update({
            where: { id: snapshot.activeDimoLinkId },
            data: { consentId },
          });
        }
      }

      await this.verifyPostWrite(
        tx,
        requestedOrganizationId,
        mutationPlans,
        createdConsentIds,
        wireConsentIds,
        runId,
      );

      return {
        createdConsents: createdConsentIds.size,
        wiredConsentIds: wireConsentIds.size,
        mutatedVehicles: mutationPlans.length,
        noopVehicles: plans.filter((p) => p.plannedAction === 'NOOP' && p.plannedLinkAction === 'NOOP').length,
      };
    });
  }

  private getMutationPlans(plans: DimoConsentBackfillVehiclePlan[]): DimoConsentBackfillVehiclePlan[] {
    return plans.filter(
      (p) =>
        (p.plannedAction === 'CREATE' && p.plannedLinkAction === 'WIRE_CONSENT_ID') ||
        (p.plannedAction === 'NOOP' && p.plannedLinkAction === 'WIRE_CONSENT_ID'),
    );
  }

  private emptyApplyResult(plans: DimoConsentBackfillVehiclePlan[]): DimoConsentBackfillApplyResult {
    return {
      createdConsents: 0,
      wiredConsentIds: 0,
      mutatedVehicles: 0,
      noopVehicles: plans.filter((p) => p.plannedAction === 'NOOP' && p.plannedLinkAction === 'NOOP').length,
    };
  }

  private assertCreatePreflight(
    plan: DimoConsentBackfillVehiclePlan,
    snapshot: ApplyTimeSnapshot,
  ): void {
    if (snapshot.activeConsentIds.length > 0) {
      throw new ConflictException({
        code: 'DIMO_CONSENT_BACKFILL_CONSENT_EXISTS',
        message: 'ACTIVE consent exists at tx-local apply gate',
        vehicleId: plan.vehicleId,
      });
    }
    if (snapshot.linkConsentId != null) {
      throw new ConflictException({
        code: 'DIMO_CONSENT_BACKFILL_UNEXPECTED_LINK_CONSENT',
        message: 'Unexpected link.consentId at tx-local apply gate',
        vehicleId: plan.vehicleId,
        consentId: snapshot.linkConsentId,
      });
    }
    if (!plan.proposedConsent) {
      throw new ConflictException({
        code: 'DIMO_CONSENT_BACKFILL_MISSING_PROPOSAL',
        message: 'Missing proposed consent payload',
        vehicleId: plan.vehicleId,
      });
    }
  }

  private assertWireOnlyPreflight(
    plan: DimoConsentBackfillVehiclePlan,
    snapshot: ApplyTimeSnapshot,
  ): string {
    if (snapshot.activeConsentIds.length !== 1) {
      throw new ConflictException({
        code: 'DIMO_CONSENT_BACKFILL_WIRE_CONSENT_CARDINALITY',
        message: 'WIRE-only apply requires exactly one ACTIVE DIMO consent',
        vehicleId: plan.vehicleId,
        activeCount: snapshot.activeConsentIds.length,
      });
    }

    const activeConsentId = snapshot.activeConsentIds[0]!;
    if (plan.currentActiveConsentId && activeConsentId !== plan.currentActiveConsentId) {
      throw new ConflictException({
        code: 'DIMO_CONSENT_BACKFILL_WIRE_CONSENT_IDENTITY',
        message: 'ACTIVE consent identity changed since dry-run',
        vehicleId: plan.vehicleId,
        expectedConsentId: plan.currentActiveConsentId,
        actualConsentId: activeConsentId,
      });
    }

    if (snapshot.linkConsentId != null && snapshot.linkConsentId !== activeConsentId) {
      throw new ConflictException({
        code: 'DIMO_CONSENT_BACKFILL_UNEXPECTED_LINK_CONSENT',
        message: 'Unexpected foreign link.consentId at tx-local apply gate',
        vehicleId: plan.vehicleId,
        consentId: snapshot.linkConsentId,
      });
    }

    if (snapshot.linkConsentId === activeConsentId) {
      throw new ConflictException({
        code: 'DIMO_CONSENT_BACKFILL_ALREADY_WIRED',
        message: 'Link already wired to ACTIVE consent at tx-local apply gate',
        vehicleId: plan.vehicleId,
      });
    }

    return activeConsentId;
  }

  private async loadApplyTimeSnapshot(
    client: DbClient,
    requestedOrganizationId: string,
    vehicleId: string,
  ): Promise<ApplyTimeSnapshot> {
    const row = await client.vehicle.findFirst({
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
    fleetIdentity: FleetIdentityIndex,
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

    if (fleetIdentity.dimoVehicleIdOwners.get(snapshot.dimoVehicleId) !== snapshot.vehicleId) {
      fail('DIMO_CONSENT_BACKFILL_DIMO_VEHICLE_COLLISION', 'dimoVehicleId collision in org');
    }
    if (fleetIdentity.tokenIdOwners.get(snapshot.dimoTokenId) !== snapshot.vehicleId) {
      fail('DIMO_CONSENT_BACKFILL_TOKEN_COLLISION', 'tokenId collision in org');
    }
  }

  private async verifyPostWrite(
    tx: Prisma.TransactionClient,
    requestedOrganizationId: string,
    mutationPlans: DimoConsentBackfillVehiclePlan[],
    createdConsentIds: Map<string, string>,
    wireConsentIds: Map<string, string>,
    runId: string,
  ): Promise<void> {
    for (const plan of mutationPlans) {
      const expectedConsentId = wireConsentIds.get(plan.vehicleId);
      if (!expectedConsentId) {
        throw new ConflictException({
          code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_MISSING_WIRE',
          message: 'Expected wired consent id missing for vehicle',
          vehicleId: plan.vehicleId,
        });
      }

      const activeConsents = await tx.vehicleProviderConsent.findMany({
        where: {
          vehicleId: plan.vehicleId,
          organizationId: requestedOrganizationId,
          provider: DIMO_DATA_SOURCE_PROVIDER,
          status: VehicleProviderConsentStatus.ACTIVE,
        },
      });

      if (activeConsents.length !== 1) {
        throw new ConflictException({
          code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_ACTIVE_CONSENT_COUNT',
          message: 'Post-write ACTIVE consent cardinality mismatch',
          vehicleId: plan.vehicleId,
          activeCount: activeConsents.length,
        });
      }

      const consent = activeConsents[0]!;
      if (consent.id !== expectedConsentId) {
        throw new ConflictException({
          code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_CONSENT_ID',
          message: 'Post-write consent id mismatch',
          vehicleId: plan.vehicleId,
        });
      }

      if (plan.plannedAction === 'CREATE') {
        if (!createdConsentIds.has(plan.vehicleId)) {
          throw new ConflictException({
            code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_CREATE_MISSING',
            message: 'CREATE target missing from created consent map',
            vehicleId: plan.vehicleId,
          });
        }
        if (!plan.proposedConsent) {
          throw new ConflictException({
            code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_PROPOSAL',
            message: 'Missing proposed consent for CREATE verification',
            vehicleId: plan.vehicleId,
          });
        }

        if (consent.providerVehicleRef !== plan.proposedConsent.providerVehicleRef) {
          throw new ConflictException({
            code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_PROVIDER_REF',
            message: 'Post-write providerVehicleRef mismatch',
            vehicleId: plan.vehicleId,
          });
        }
        if (consent.expiresAt != null || consent.revokedAt != null) {
          throw new ConflictException({
            code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_EXPIRY',
            message: 'Post-write consent expiry/revocation mismatch',
            vehicleId: plan.vehicleId,
          });
        }

        const metadata = consent.metadataJson as Record<string, unknown> | null;
        if (metadata?.dimoTokenId !== plan.dimoTokenId) {
          throw new ConflictException({
            code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_METADATA_TOKEN',
            message: 'Post-write metadata dimoTokenId mismatch',
            vehicleId: plan.vehicleId,
          });
        }
        if (metadata?.dimoVehicleId !== plan.dimoVehicleId) {
          throw new ConflictException({
            code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_METADATA_DIMO_VEHICLE',
            message: 'Post-write metadata dimoVehicleId mismatch',
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
      } else if (createdConsentIds.has(plan.vehicleId)) {
        throw new ConflictException({
          code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_WIRE_CREATED',
          message: 'WIRE-only target must not create a new consent row',
          vehicleId: plan.vehicleId,
        });
      }

      const activeLinks = await tx.vehicleDataSourceLink.findMany({
        where: {
          vehicleId: plan.vehicleId,
          provider: DIMO_DATA_SOURCE_PROVIDER,
          isActive: true,
          dimoVehicleId: { not: null },
        },
      });

      if (activeLinks.length !== 1) {
        throw new ConflictException({
          code: 'DIMO_CONSENT_BACKFILL_POST_VERIFY_ACTIVE_LINK_COUNT',
          message: 'Post-write active DIMO link cardinality mismatch',
          vehicleId: plan.vehicleId,
          activeLinkCount: activeLinks.length,
        });
      }

      const link = activeLinks[0]!;
      if (link.id !== plan.activeDimoLinkId || link.consentId !== expectedConsentId) {
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

  private async loadTargetVehicles(
    client: DbClient,
    organizationId: string,
    vehicleIds: string[],
  ) {
    return client.vehicle.findMany({
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

  private async loadFleetIdentityIndex(
    client: DbClient,
    organizationId: string,
  ): Promise<FleetIdentityIndex> {
    const fleet = await client.vehicle.findMany({
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
    applyResult: DimoConsentBackfillApplyResult,
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
      applied: applyResult.mutatedVehicles,
      createdConsents: applyResult.createdConsents,
      wiredConsentIds: applyResult.wiredConsentIds,
      mutatedVehicles: applyResult.mutatedVehicles,
      noopVehicles: applyResult.noopVehicles,
      atomicApply: true,
      partialWritePossible: false,
      vehicles: plans,
    };
  }
}
