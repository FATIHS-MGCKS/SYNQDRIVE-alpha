import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ConnectivityObservabilityService } from './connectivity/connectivity-observability.service';
import {
  DIMO_DATA_SOURCE_PROVIDER,
  DIMO_DATA_SOURCE_SUBTYPE,
  DIMO_DATA_SOURCE_TYPE,
  DIMO_LINK_METADATA_VERSION,
  type DimoLinkProvenance,
} from './dimo-vehicle-data-source-link.contract';
import {
  assessInactiveLinkReactivation,
} from './dimo-vehicle-data-source-link.reactivation.policy';
import {
  DimoBackfillSummary,
  DimoBackfillVehicleReport,
  DimoConsentProvenance,
  DimoProviderLinkDriftItem,
  DimoProviderLinkDriftReport,
  EnsureDimoVehicleDataSourceLinkInput,
  EnsureDimoVehicleDataSourceLinkResult,
} from './dimo-vehicle-data-source-link.types';

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class DimoVehicleDataSourceLinkService {
  private readonly logger = new Logger(DimoVehicleDataSourceLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly connectivityObservability?: ConnectivityObservabilityService,
  ) {}

  /**
   * sourceReferenceId authority: Vehicle.dimoVehicleId → DimoVehicle.id (stable UUID).
   */
  static resolveSourceReferenceId(dimoVehicleId: string): string {
    return dimoVehicleId;
  }

  /**
   * Consent provenance: prefer latest ACTIVE consent; otherwise latest consent for audit trail.
   * Mapping creation does not require active consent.
   */
  async resolveConsentProvenance(
    vehicleId: string,
    organizationId: string,
    client: DbClient = this.prisma,
  ): Promise<DimoConsentProvenance> {
    const active = await client.vehicleProviderConsent.findFirst({
      where: {
        vehicleId,
        organizationId,
        provider: DIMO_DATA_SOURCE_PROVIDER,
        status: 'ACTIVE',
      },
      orderBy: { grantedAt: 'desc' },
      select: { id: true, status: true },
    });
    if (active) {
      return {
        consentId: active.id,
        consentStatus: active.status,
        selection: 'active',
      };
    }

    const latest = await client.vehicleProviderConsent.findFirst({
      where: {
        vehicleId,
        organizationId,
        provider: DIMO_DATA_SOURCE_PROVIDER,
      },
      orderBy: { grantedAt: 'desc' },
      select: { id: true, status: true },
    });
    if (latest) {
      return {
        consentId: latest.id,
        consentStatus: latest.status,
        selection: 'latest_inactive',
      };
    }

    return {
      consentId: null,
      consentStatus: 'MISSING',
      selection: 'none',
    };
  }

  async ensureDimoVehicleDataSourceLink(
    input: EnsureDimoVehicleDataSourceLinkInput,
    client: DbClient = this.prisma,
  ): Promise<EnsureDimoVehicleDataSourceLinkResult> {
    const now = input.now ?? new Date();
    const sourceReferenceId = DimoVehicleDataSourceLinkService.resolveSourceReferenceId(
      input.dimoVehicleId,
    );

    const [vehicle, dimoVehicle] = await Promise.all([
      client.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
        select: { id: true, organizationId: true, dimoVehicleId: true },
      }),
      client.dimoVehicle.findUnique({
        where: { id: input.dimoVehicleId },
        select: { id: true, externalId: true },
      }),
    ]);

    if (!vehicle) {
      throw new NotFoundException(
        `Vehicle ${input.vehicleId} not found for organization ${input.organizationId}`,
      );
    }
    if (!dimoVehicle) {
      throw new NotFoundException(`DimoVehicle ${input.dimoVehicleId} not found`);
    }
    if (vehicle.dimoVehicleId !== input.dimoVehicleId) {
      return {
        action: 'CONFLICT',
        linkId: null,
        reason: 'vehicle_dimo_binding_mismatch',
        sourceReferenceId,
        consentId: input.consentId ?? null,
      };
    }

    const crossTenantLink = await client.vehicleDataSourceLink.findFirst({
      where: {
        provider: DIMO_DATA_SOURCE_PROVIDER,
        sourceType: DIMO_DATA_SOURCE_TYPE,
        sourceReferenceId,
        isActive: true,
        vehicle: { organizationId: { not: input.organizationId } },
      },
      select: { id: true, vehicleId: true },
    });
    if (crossTenantLink) {
      this.observeBinding('conflict', input.provenance);
      return {
        action: 'CONFLICT',
        linkId: null,
        reason: 'cross_tenant_active_mapping',
        sourceReferenceId,
        consentId: input.consentId ?? null,
      };
    }

    const links = await client.vehicleDataSourceLink.findMany({
      where: {
        vehicleId: input.vehicleId,
        provider: DIMO_DATA_SOURCE_PROVIDER,
        sourceType: DIMO_DATA_SOURCE_TYPE,
        sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
      },
      orderBy: { activatedAt: 'desc' },
    });

    const activeLinks = links.filter((l) => l.isActive);
    if (activeLinks.length > 1) {
      this.observeBinding('conflict', input.provenance);
      return {
        action: 'CONFLICT',
        linkId: null,
        reason: 'duplicate_active_dimo_links',
        sourceReferenceId,
        consentId: input.consentId ?? null,
      };
    }

    const activeLink = activeLinks[0] ?? null;
    if (activeLink) {
      if (activeLink.sourceReferenceId !== sourceReferenceId) {
        this.observeBinding('conflict', input.provenance);
        return {
          action: 'CONFLICT',
          linkId: activeLink.id,
          reason: 'conflicting_active_source_reference',
          sourceReferenceId,
          consentId: activeLink.consentId,
        };
      }

      await client.vehicleDataSourceLink.update({
        where: { id: activeLink.id },
        data: { lastVerifiedAt: now },
      });
      this.observeBinding('noop', input.provenance);
      return {
        action: 'NOOP',
        linkId: activeLink.id,
        reason: 'active_link_already_correct',
        sourceReferenceId,
        consentId: activeLink.consentId,
      };
    }

    const inactiveMatch = links.find(
      (l) => !l.isActive && l.sourceReferenceId === sourceReferenceId,
    );
    if (inactiveMatch) {
      const reactivation = assessInactiveLinkReactivation(
        {
          deactivatedAt: inactiveMatch.deactivatedAt,
          metadata: inactiveMatch.metadata,
        },
        input.provenance ?? 'manual',
      );
      if (!reactivation.eligible) {
        this.observeBinding('conflict', input.provenance);
        return {
          action: 'CONFLICT',
          linkId: inactiveMatch.id,
          reason:
            reactivation.reason === 'backfill_reconciliation_never_reactivates'
              ? 'inactive_link_requires_manual_review'
              : reactivation.reason,
          sourceReferenceId,
          consentId: inactiveMatch.consentId,
        };
      }

      const consentId =
        input.consentId !== undefined
          ? input.consentId
          : inactiveMatch.consentId;
      const updated = await client.vehicleDataSourceLink.update({
        where: { id: inactiveMatch.id },
        data: {
          isActive: true,
          deactivatedAt: null,
          activatedAt: now,
          lastVerifiedAt: now,
          consentId,
          linkedByUserId: input.linkedByUserId ?? inactiveMatch.linkedByUserId,
          metadata: this.buildMetadata(dimoVehicle.externalId, input),
        },
      });
      this.observeBinding('reactivated', input.provenance);
      this.logger.log(
        `DIMO link reactivated vehicle=${input.vehicleId} link=${updated.id} provenance=${input.provenance ?? 'unknown'}`,
      );
      return {
        action: 'REACTIVATE',
        linkId: updated.id,
        reason: 'reactivated_inactive_link',
        sourceReferenceId,
        consentId: updated.consentId,
      };
    }

    const inactiveConflict = links.find(
      (l) => !l.isActive && l.sourceReferenceId !== sourceReferenceId,
    );
    if (inactiveConflict) {
      this.observeBinding('conflict', input.provenance);
      return {
        action: 'CONFLICT',
        linkId: inactiveConflict.id,
        reason: 'inactive_link_source_reference_mismatch',
        sourceReferenceId,
        consentId: inactiveConflict.consentId,
      };
    }

    const consentId =
      input.consentId !== undefined
        ? input.consentId
        : (await this.resolveConsentProvenance(input.vehicleId, input.organizationId, client))
            .consentId;

    const created = await client.vehicleDataSourceLink.create({
      data: {
        vehicleId: input.vehicleId,
        provider: DIMO_DATA_SOURCE_PROVIDER,
        sourceType: DIMO_DATA_SOURCE_TYPE,
        sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
        sourceReferenceId,
        consentId,
        isActive: true,
        activatedAt: now,
        lastVerifiedAt: now,
        linkedByUserId: input.linkedByUserId ?? null,
        metadata: this.buildMetadata(dimoVehicle.externalId, input),
      },
    });

    this.observeBinding('created', input.provenance);
    this.logger.log(
      `DIMO link created vehicle=${input.vehicleId} link=${created.id} provenance=${input.provenance ?? 'unknown'}`,
    );
    return {
      action: 'CREATE',
      linkId: created.id,
      reason: 'created_missing_link',
      sourceReferenceId,
      consentId: created.consentId,
    };
  }

  /**
   * Registration path — fail the transaction on unrecoverable mapping conflicts.
   */
  async ensureDimoVehicleDataSourceLinkOrThrow(
    input: EnsureDimoVehicleDataSourceLinkInput,
    client: DbClient,
  ): Promise<EnsureDimoVehicleDataSourceLinkResult> {
    const result = await this.ensureDimoVehicleDataSourceLink(input, client);
    if (result.action === 'CONFLICT') {
      this.logger.error(
        `DIMO link registration failed vehicle=${input.vehicleId} dimoVehicle=${input.dimoVehicleId} reason=${result.reason}`,
      );
      throw new ConflictException({
        code: 'DIMO_PROVIDER_LINK_CONFLICT',
        message: 'Failed to materialize canonical DIMO provider link',
        vehicleId: input.vehicleId,
        dimoVehicleId: input.dimoVehicleId,
        reason: result.reason,
      });
    }
    if (result.action === 'SKIP') {
      throw new BadRequestException({
        code: 'DIMO_PROVIDER_LINK_SKIPPED',
        message: 'DIMO provider link could not be ensured',
        vehicleId: input.vehicleId,
        reason: result.reason,
      });
    }
    return result;
  }

  async planBackfillForOrganization(
    organizationId: string,
  ): Promise<DimoBackfillVehicleReport[]> {
    const vehicles = await this.loadBackfillCandidates(organizationId);
    const reports: DimoBackfillVehicleReport[] = [];

    for (const vehicle of vehicles) {
      reports.push(await this.planBackfillForVehicle(vehicle));
    }
    return reports;
  }

  async runBackfill(input: {
    organizationId?: string;
    apply: boolean;
    runId?: string;
    linkedByUserId?: string | null;
  }): Promise<DimoBackfillSummary> {
    const runId = input.runId ?? `dimo-link-backfill-${Date.now()}`;
    const organizationIds = input.organizationId
      ? [input.organizationId]
      : await this.listOrganizationsWithDimoVehicles();

    const vehicles = (
      await Promise.all(organizationIds.map((orgId) => this.loadBackfillCandidates(orgId)))
    ).flat();

    const reports: DimoBackfillVehicleReport[] = [];
    let applied = 0;

    for (const vehicle of vehicles) {
      const plan = await this.planBackfillForVehicle(vehicle);
      reports.push(plan);

      if (input.apply && plan.plannedAction === 'CREATE') {
        const result = await this.ensureDimoVehicleDataSourceLink({
          organizationId: vehicle.organizationId,
          vehicleId: vehicle.id,
          dimoVehicleId: vehicle.dimoVehicleId!,
          consentId: plan.consentProvenance.consentId,
          linkedByUserId: input.linkedByUserId ?? null,
          provenance: 'backfill',
          runId,
        });
        if (result.action === 'CREATE') {
          applied += 1;
        }
      }
    }

    return this.summarizeBackfill(
      input.apply ? 'apply' : 'dry-run',
      input.organizationId ?? null,
      runId,
      reports,
      applied,
    );
  }

  async auditProviderLinkDrift(input?: {
    organizationId?: string;
  }): Promise<DimoProviderLinkDriftReport> {
    const organizationIds = input?.organizationId
      ? [input.organizationId]
      : await this.listOrganizationsWithDimoVehicles();

    const items: DimoProviderLinkDriftItem[] = [];

    for (const organizationId of organizationIds) {
      const vehicles = await this.loadBackfillCandidates(organizationId);
      for (const vehicle of vehicles) {
        const plan = await this.planBackfillForVehicle(vehicle);
        const hasActiveDimoLink = plan.existingActiveDimoLink;
        let classification: DimoProviderLinkDriftItem['classification'];
        if (plan.plannedAction === 'CONFLICT' || plan.plannedAction === 'SKIP') {
          classification = 'ambiguous';
        } else if (!hasActiveDimoLink && plan.dimoVehicleRelationValid) {
          classification = 'missing_link';
        } else {
          classification = 'healthy';
        }

        items.push({
          vehicleId: vehicle.id,
          vehicleRef: vehicle.vehicleRef,
          organizationId: vehicle.organizationId,
          dimoVehicleId: vehicle.dimoVehicleId!,
          hasActiveDimoLink,
          classification,
          reason: plan.reason,
        });
      }
    }

    return {
      scanned: items.length,
      missingLink: items.filter((i) => i.classification === 'missing_link').length,
      healthy: items.filter((i) => i.classification === 'healthy').length,
      ambiguous: items.filter((i) => i.classification === 'ambiguous').length,
      items,
    };
  }

  async reconcileSafeDrift(input: {
    organizationId?: string;
    apply: boolean;
    runId?: string;
  }): Promise<DimoBackfillSummary> {
    const runId = input.runId ?? `dimo-link-reconcile-${Date.now()}`;
    const drift = await this.auditProviderLinkDrift({
      organizationId: input.organizationId,
    });

    const vehicleIds = new Set(
      drift.items
        .filter((i) => i.classification === 'missing_link')
        .map((i) => i.vehicleId),
    );

    const organizationIds = input.organizationId
      ? [input.organizationId]
      : await this.listOrganizationsWithDimoVehicles();

    const vehicles = (
      await Promise.all(organizationIds.map((orgId) => this.loadBackfillCandidates(orgId)))
    )
      .flat()
      .filter((v) => vehicleIds.has(v.id));

    const reports: DimoBackfillVehicleReport[] = [];
    let applied = 0;

    for (const vehicle of vehicles) {
      const plan = await this.planBackfillForVehicle(vehicle);
      reports.push(plan);
      if (
        input.apply &&
        plan.plannedAction === 'CREATE' &&
        plan.dimoVehicleRelationValid &&
        !plan.existingActiveDimoLink
      ) {
        const result = await this.ensureDimoVehicleDataSourceLink({
          organizationId: vehicle.organizationId,
          vehicleId: vehicle.id,
          dimoVehicleId: vehicle.dimoVehicleId!,
          consentId: plan.consentProvenance.consentId,
          provenance: 'reconciliation',
          runId,
        });
        if (result.action === 'CREATE') {
          applied += 1;
        }
      }
    }

    return this.summarizeBackfill(
      input.apply ? 'apply' : 'dry-run',
      input.organizationId ?? null,
      runId,
      reports,
      applied,
    );
  }

  private async planBackfillForVehicle(vehicle: BackfillCandidate): Promise<DimoBackfillVehicleReport> {
    const dimoVehicleRelationValid =
      vehicle.dimoVehicleId != null && vehicle.dimoVehicle != null;

    if (!dimoVehicleRelationValid) {
      return {
        vehicleId: vehicle.id,
        vehicleRef: vehicle.vehicleRef,
        organizationId: vehicle.organizationId,
        dimoVehicleRelationValid: false,
        existingActiveDimoLink: false,
        existingInactiveDimoLink: false,
        candidateSourceReferenceId: null,
        consentProvenance: {
          consentId: null,
          consentStatus: 'MISSING',
          selection: 'none',
        },
        plannedAction: 'SKIP',
        reason: 'missing_or_invalid_dimo_relation',
      };
    }

    const consentProvenance = await this.resolveConsentProvenance(
      vehicle.id,
      vehicle.organizationId,
    );

    const activeLinks = vehicle.dataSourceLinks.filter((l) => l.isActive);
    const inactiveLinks = vehicle.dataSourceLinks.filter((l) => !l.isActive);
    const sourceReferenceId = DimoVehicleDataSourceLinkService.resolveSourceReferenceId(
      vehicle.dimoVehicleId!,
    );

    if (activeLinks.length > 1) {
      return {
        vehicleId: vehicle.id,
        vehicleRef: vehicle.vehicleRef,
        organizationId: vehicle.organizationId,
        dimoVehicleRelationValid: true,
        existingActiveDimoLink: true,
        existingInactiveDimoLink: inactiveLinks.length > 0,
        candidateSourceReferenceId: sourceReferenceId,
        consentProvenance,
        plannedAction: 'CONFLICT',
        reason: 'duplicate_active_dimo_links',
      };
    }

    const activeLink = activeLinks[0] ?? null;
    if (activeLink) {
      if (activeLink.sourceReferenceId !== sourceReferenceId) {
        return {
          vehicleId: vehicle.id,
          vehicleRef: vehicle.vehicleRef,
          organizationId: vehicle.organizationId,
          dimoVehicleRelationValid: true,
          existingActiveDimoLink: true,
          existingInactiveDimoLink: inactiveLinks.length > 0,
          candidateSourceReferenceId: sourceReferenceId,
          consentProvenance,
          plannedAction: 'CONFLICT',
          reason: 'conflicting_active_source_reference',
        };
      }
      return {
        vehicleId: vehicle.id,
        vehicleRef: vehicle.vehicleRef,
        organizationId: vehicle.organizationId,
        dimoVehicleRelationValid: true,
        existingActiveDimoLink: true,
        existingInactiveDimoLink: inactiveLinks.length > 0,
        candidateSourceReferenceId: sourceReferenceId,
        consentProvenance,
        plannedAction: 'NOOP',
        reason: 'active_link_already_correct',
      };
    }

    const inactiveMatch = inactiveLinks.find(
      (l) => l.sourceReferenceId === sourceReferenceId,
    );
    if (inactiveMatch) {
      return {
        vehicleId: vehicle.id,
        vehicleRef: vehicle.vehicleRef,
        organizationId: vehicle.organizationId,
        dimoVehicleRelationValid: true,
        existingActiveDimoLink: false,
        existingInactiveDimoLink: true,
        candidateSourceReferenceId: sourceReferenceId,
        consentProvenance,
        plannedAction: 'CONFLICT',
        reason: 'inactive_link_requires_manual_review',
      };
    }

    if (inactiveLinks.some((l) => l.sourceReferenceId !== sourceReferenceId)) {
      return {
        vehicleId: vehicle.id,
        vehicleRef: vehicle.vehicleRef,
        organizationId: vehicle.organizationId,
        dimoVehicleRelationValid: true,
        existingActiveDimoLink: false,
        existingInactiveDimoLink: true,
        candidateSourceReferenceId: sourceReferenceId,
        consentProvenance,
        plannedAction: 'CONFLICT',
        reason: 'inactive_link_source_reference_mismatch',
      };
    }

    return {
      vehicleId: vehicle.id,
      vehicleRef: vehicle.vehicleRef,
      organizationId: vehicle.organizationId,
      dimoVehicleRelationValid: true,
      existingActiveDimoLink: false,
      existingInactiveDimoLink: false,
      candidateSourceReferenceId: sourceReferenceId,
      consentProvenance,
      plannedAction: 'CREATE',
      reason: 'missing_active_dimo_link',
    };
  }

  private async loadBackfillCandidates(organizationId: string): Promise<BackfillCandidate[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        dimoVehicleId: { not: null },
      },
      select: {
        id: true,
        organizationId: true,
        licensePlate: true,
        vehicleName: true,
        dimoVehicleId: true,
        dimoVehicle: { select: { id: true } },
        dataSourceLinks: {
          where: {
            provider: DIMO_DATA_SOURCE_PROVIDER,
            sourceType: DIMO_DATA_SOURCE_TYPE,
            sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
          },
          select: {
            id: true,
            sourceReferenceId: true,
            isActive: true,
            deactivatedAt: true,
            metadata: true,
          },
        },
      },
      orderBy: { licensePlate: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      vehicleRef: row.licensePlate?.trim() || row.vehicleName?.trim() || row.id,
      dimoVehicleId: row.dimoVehicleId,
      dimoVehicle: row.dimoVehicle,
      dataSourceLinks: row.dataSourceLinks,
    }));
  }

  private async listOrganizationsWithDimoVehicles(): Promise<string[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: { dimoVehicleId: { not: null } },
      distinct: ['organizationId'],
      select: { organizationId: true },
    });
    return rows.map((r) => r.organizationId);
  }

  private summarizeBackfill(
    mode: 'dry-run' | 'apply',
    organizationId: string | null,
    runId: string,
    reports: DimoBackfillVehicleReport[],
    applied: number,
  ): DimoBackfillSummary {
    return {
      mode,
      organizationId,
      runId,
      scanned: reports.length,
      plannedCreate: reports.filter((r) => r.plannedAction === 'CREATE').length,
      plannedReactivate: reports.filter((r) => r.plannedAction === 'REACTIVATE').length,
      plannedNoop: reports.filter((r) => r.plannedAction === 'NOOP').length,
      plannedConflict: reports.filter((r) => r.plannedAction === 'CONFLICT').length,
      plannedSkip: reports.filter((r) => r.plannedAction === 'SKIP').length,
      applied,
      vehicles: reports,
    };
  }

  private buildMetadata(
    dimoExternalId: string | null,
    input: EnsureDimoVehicleDataSourceLinkInput,
  ): Prisma.InputJsonValue {
    return {
      version: DIMO_LINK_METADATA_VERSION,
      provenance: input.provenance ?? 'manual',
      runId: input.runId ?? null,
      dimoExternalId,
    };
  }

  private observeBinding(
    outcome: 'created' | 'reactivated' | 'noop' | 'conflict',
    provenance?: DimoLinkProvenance,
  ): void {
    this.connectivityObservability?.log('binding_changed', {
      provider: DIMO_DATA_SOURCE_PROVIDER,
      outcome,
      method: provenance ?? 'unknown',
    });
  }
}

interface BackfillCandidate {
  id: string;
  organizationId: string;
  vehicleRef: string;
  dimoVehicleId: string | null;
  dimoVehicle: { id: string } | null;
  dataSourceLinks: Array<{
    id: string;
    sourceReferenceId: string;
    isActive: boolean;
    deactivatedAt: Date | null;
    metadata: unknown;
  }>;
}
