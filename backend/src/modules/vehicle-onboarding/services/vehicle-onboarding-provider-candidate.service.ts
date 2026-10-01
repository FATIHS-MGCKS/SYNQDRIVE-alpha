import { Injectable } from '@nestjs/common';
import type { DimoVehicle, HighMobilityVehicle, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildDimoOnboardingSourceSnapshot } from '../adapters/dimo-onboarding-source.adapter';
import { buildHmOnboardingSourceSnapshot } from '../adapters/high-mobility-onboarding-source.adapter';
import { resolveCandidateDispositionFromActiveClaims } from '../candidate-discovery/provider-candidate-disposition.authority';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type {
  ProviderCandidateDto,
  ProviderCandidateListDto,
} from '../http/provider-candidate.projection';
import type { ValidatedCandidateListQuery } from '../policy/candidate-list-query.validation';
import { ACTIVE_ONBOARDING_CASE_STATUSES } from '../source-adoption/global-source-claim.authority';
import { isSourceCanonicallySuppressed } from '../source-adoption/canonical-source-suppression.read';
import { PLATFORM_TRUSTED_SOURCE_ADOPTION } from '../source-adoption/platform-trusted-adoption.context';
import type { SourceClaimProvider } from '../source-adoption/source-claim-lock';
import { VehicleOnboardingSourceAdoptionAuthority } from '../source-adoption/vehicle-onboarding-source-adoption.authority';

@Injectable()
export class VehicleOnboardingProviderCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adoptionAuthority: VehicleOnboardingSourceAdoptionAuthority,
  ) {}

  async listProviderCandidates(
    organizationId: string,
    query: ValidatedCandidateListQuery,
  ): Promise<ProviderCandidateListDto> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) {
      throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding target organization not found');
    }

    if (query.provider) {
      return this.listForProvider(organizationId, query.provider, query.limit, query.cursor);
    }

    const [dimoPage, hmPage] = await Promise.all([
      this.listDimoCandidates(organizationId, query.limit, query.cursor),
      this.listHmCandidates(organizationId, query.limit, query.cursor),
    ]);

    const merged = [...dimoPage.items, ...hmPage.items].sort((a, b) =>
      `${a.provider}:${a.sourceMirrorId}`.localeCompare(`${b.provider}:${b.sourceMirrorId}`),
    );
    const items = merged.slice(0, query.limit);
    const nextCursor =
      merged.length > query.limit && items.length > 0
        ? items[items.length - 1]!.sourceMirrorId
        : null;
    return { items, nextCursor };
  }

  private async listForProvider(
    organizationId: string,
    provider: SourceClaimProvider,
    limit: number,
    cursor?: string,
  ): Promise<ProviderCandidateListDto> {
    if (provider === 'DIMO') {
      return this.listDimoCandidates(organizationId, limit, cursor);
    }
    return this.listHmCandidates(organizationId, limit, cursor);
  }

  private async listDimoCandidates(
    organizationId: string,
    limit: number,
    cursor?: string,
  ): Promise<ProviderCandidateListDto> {
    const items: ProviderCandidateDto[] = [];
    let scanCursor = cursor;
    let nextCursor: string | null = null;
    while (items.length < limit) {
      const mirrors = await this.prisma.dimoVehicle.findMany({
        where: scanCursor ? { id: { gt: scanCursor } } : undefined,
        orderBy: { id: 'asc' },
        take: 50,
        select: {
          id: true,
          externalId: true,
          vin: true,
          make: true,
          model: true,
          year: true,
          fuelType: true,
          connectionStatus: true,
          updatedAt: true,
        },
      });
      if (mirrors.length === 0) {
        break;
      }
      for (let i = 0; i < mirrors.length; i++) {
        const dimo = mirrors[i]!;
        scanCursor = dimo.id;
        const projected = await this.projectDimoCandidate(organizationId, dimo);
        if (projected) {
          items.push(projected);
        }
        if (items.length >= limit) {
          const hasRemainder = i < mirrors.length - 1 || mirrors.length === 50;
          if (hasRemainder) {
            nextCursor = scanCursor;
          }
          break;
        }
      }
      if (items.length >= limit) {
        break;
      }
      if (mirrors.length < 50) {
        break;
      }
    }

    return { items, nextCursor };
  }

  private async listHmCandidates(
    organizationId: string,
    limit: number,
    cursor?: string,
  ): Promise<ProviderCandidateListDto> {
    const baseWhere: Prisma.HighMobilityVehicleWhereInput = {
      isActive: true,
      clearanceStatus: 'APPROVED',
      OR: [{ organizationId }, { organizationId: null }],
    };

    const items: ProviderCandidateDto[] = [];
    let scanCursor = cursor;
    let nextCursor: string | null = null;
    while (items.length < limit) {
      const mirrors = await this.prisma.highMobilityVehicle.findMany({
        where: {
          ...baseWhere,
          ...(scanCursor ? { id: { gt: scanCursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 50,
        select: {
          id: true,
          organizationId: true,
          vin: true,
          brand: true,
          hmVehicleReference: true,
          clearanceStatus: true,
          isActive: true,
          synqdriveVehicleId: true,
          registrationState: true,
          sourceMode: true,
          packageType: true,
          appContainerType: true,
          updatedAt: true,
        },
      });
      if (mirrors.length === 0) {
        break;
      }
      for (let i = 0; i < mirrors.length; i++) {
        const hm = mirrors[i]!;
        scanCursor = hm.id;
        const projected = await this.projectHmCandidate(organizationId, hm);
        if (projected) {
          items.push(projected);
        }
        if (items.length >= limit) {
          const hasRemainder = i < mirrors.length - 1 || mirrors.length === 50;
          if (hasRemainder) {
            nextCursor = scanCursor;
          }
          break;
        }
      }
      if (items.length >= limit) {
        break;
      }
      if (mirrors.length < 50) {
        break;
      }
    }

    return { items, nextCursor };
  }

  private async projectDimoCandidate(
    organizationId: string,
    dimo: Pick<
      DimoVehicle,
      'id' | 'externalId' | 'vin' | 'make' | 'model' | 'year' | 'fuelType' | 'connectionStatus' | 'updatedAt'
    >,
  ): Promise<ProviderCandidateDto | null> {
    try {
      this.adoptionAuthority.assertDimoPlatformMirrorAdoptable(
        dimo,
        organizationId,
        PLATFORM_TRUSTED_SOURCE_ADOPTION,
      );
    } catch {
      return null;
    }

    if (await isSourceCanonicallySuppressed(this.prisma, 'DIMO', dimo.id)) {
      return null;
    }

    const disposition = await this.resolveDisposition('DIMO', dimo.id, organizationId);
    if (!disposition) {
      return null;
    }

    const snap = buildDimoOnboardingSourceSnapshot(dimo);
    return {
      provider: 'DIMO',
      sourceMirrorId: dimo.id,
      externalVehicleIdentity: snap.externalVehicleIdentity,
      vin: snap.vin,
      make: snap.make,
      model: snap.model,
      year: snap.year,
      disposition: disposition.disposition,
      resumableCaseId:
        disposition.disposition === 'RESUMABLE' ? disposition.resumableCaseId : null,
      providerDisplayState: dimo.connectionStatus ?? null,
    };
  }

  private async projectHmCandidate(
    organizationId: string,
    hm: Pick<
      HighMobilityVehicle,
      | 'id'
      | 'organizationId'
      | 'vin'
      | 'brand'
      | 'hmVehicleReference'
      | 'clearanceStatus'
      | 'isActive'
      | 'synqdriveVehicleId'
      | 'registrationState'
      | 'sourceMode'
      | 'packageType'
      | 'appContainerType'
      | 'updatedAt'
    >,
  ): Promise<ProviderCandidateDto | null> {
    try {
      this.adoptionAuthority.assertHighMobilityMirrorAdoptable(
        hm,
        organizationId,
        PLATFORM_TRUSTED_SOURCE_ADOPTION,
      );
    } catch {
      return null;
    }

    if (await isSourceCanonicallySuppressed(this.prisma, 'HIGH_MOBILITY', hm.id)) {
      return null;
    }

    const disposition = await this.resolveDisposition('HIGH_MOBILITY', hm.id, organizationId);
    if (!disposition) {
      return null;
    }

    const snap = buildHmOnboardingSourceSnapshot(hm, organizationId);
    return {
      provider: 'HIGH_MOBILITY',
      sourceMirrorId: hm.id,
      externalVehicleIdentity: snap.externalVehicleIdentity,
      vin: snap.vin,
      make: snap.make,
      model: snap.model,
      year: snap.year,
      disposition: disposition.disposition,
      resumableCaseId:
        disposition.disposition === 'RESUMABLE' ? disposition.resumableCaseId : null,
      providerDisplayState: hm.clearanceStatus,
    };
  }

  private async resolveDisposition(
    provider: SourceClaimProvider,
    sourceMirrorId: string,
    organizationId: string,
  ) {
    const refs = await this.prisma.vehicleOnboardingCaseSourceRef.findMany({
      where: {
        provider,
        sourceMirrorId,
        onboardingCase: { status: { in: [...ACTIVE_ONBOARDING_CASE_STATUSES] } },
      },
      include: {
        onboardingCase: {
          select: {
            id: true,
            organizationId: true,
            primarySourceProvider: true,
            primarySourceScopeKey: true,
            primarySourceExternalId: true,
          },
        },
      },
    });

    return resolveCandidateDispositionFromActiveClaims(
      refs.map((ref) => ({ ref, onboardingCase: ref.onboardingCase })),
      organizationId,
    );
  }
}
