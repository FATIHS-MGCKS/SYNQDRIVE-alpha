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
import {
  combinedCursor,
  hmPhaseStartCursor,
  type ProviderCandidateCursorPhase,
  type ProviderCandidateListCursor,
  providerScopedCursor,
  scanAfterMirrorId,
} from '../policy/provider-candidate-list.cursor';
import { ACTIVE_ONBOARDING_CASE_STATUSES } from '../source-adoption/global-source-claim.authority';
import { isSourceCanonicallySuppressed } from '../source-adoption/canonical-source-suppression.read';
import { PLATFORM_TRUSTED_SOURCE_ADOPTION } from '../source-adoption/platform-trusted-adoption.context';
import type { SourceClaimProvider } from '../source-adoption/source-claim-lock';
import { VehicleOnboardingSourceAdoptionAuthority } from '../source-adoption/vehicle-onboarding-source-adoption.authority';

const SCAN_BATCH_SIZE = 50;

/**
 * Global combined ordering (deterministic):
 * 1. DIMO mirrors by id ASC (projected candidates only)
 * 2. HIGH_MOBILITY mirrors by id ASC (projected candidates only)
 */
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

    return this.listCombinedCandidates(organizationId, query.limit, query.cursor);
  }

  private async listForProvider(
    organizationId: string,
    provider: SourceClaimProvider,
    limit: number,
    cursor?: ProviderCandidateListCursor,
  ): Promise<ProviderCandidateListDto> {
    if (provider === 'DIMO') {
      return this.listDimoCandidates(organizationId, limit, cursor);
    }
    return this.listHmCandidates(organizationId, limit, cursor);
  }

  private async listCombinedCandidates(
    organizationId: string,
    limit: number,
    cursor?: ProviderCandidateListCursor,
  ): Promise<ProviderCandidateListDto> {
    let phase: ProviderCandidateCursorPhase =
      cursor?.phase === 'HIGH_MOBILITY' ? 'HIGH_MOBILITY' : 'DIMO';
    let dimoScanAfter =
      cursor?.phase === 'DIMO' ? scanAfterMirrorId(cursor) : undefined;
    let hmScanAfter =
      cursor?.phase === 'HIGH_MOBILITY' ? scanAfterMirrorId(cursor) : undefined;

    const items: ProviderCandidateDto[] = [];
    let lastScannedDimo: string | undefined;
    let lastScannedHm: string | undefined;
    let dimoTableExhausted = phase === 'HIGH_MOBILITY';

    while (items.length < limit) {
      if (!dimoTableExhausted && phase === 'DIMO') {
        const mirrors = await this.prisma.dimoVehicle.findMany({
          where: dimoScanAfter ? { id: { gt: dimoScanAfter } } : undefined,
          orderBy: { id: 'asc' },
          take: SCAN_BATCH_SIZE,
          select: this.dimoSelect(),
        });
        if (mirrors.length === 0) {
          dimoTableExhausted = true;
          phase = 'HIGH_MOBILITY';
          dimoScanAfter = undefined;
          continue;
        }
        for (let i = 0; i < mirrors.length; i++) {
          const dimo = mirrors[i]!;
          dimoScanAfter = dimo.id;
          lastScannedDimo = dimo.id;
          const projected = await this.projectDimoCandidate(organizationId, dimo);
          if (projected) {
            items.push(projected);
          }
          if (items.length >= limit) {
            const moreDimoInTable =
              i < mirrors.length - 1 || mirrors.length === SCAN_BATCH_SIZE;
            if (moreDimoInTable) {
              return { items, nextCursor: combinedCursor('DIMO', lastScannedDimo!) };
            }
            dimoTableExhausted = true;
            phase = 'HIGH_MOBILITY';
            hmScanAfter = undefined;
            break;
          }
        }
        if (items.length >= limit && dimoTableExhausted) {
          return { items, nextCursor: hmPhaseStartCursor() };
        }
        if (mirrors.length < SCAN_BATCH_SIZE) {
          dimoTableExhausted = true;
          phase = 'HIGH_MOBILITY';
          dimoScanAfter = undefined;
        }
        continue;
      }

      const mirrors = await this.prisma.highMobilityVehicle.findMany({
        where: {
          ...this.hmBaseWhere(organizationId),
          ...(hmScanAfter ? { id: { gt: hmScanAfter } } : {}),
        },
        orderBy: { id: 'asc' },
        take: SCAN_BATCH_SIZE,
        select: this.hmSelect(),
      });
      if (mirrors.length === 0) {
        return { items, nextCursor: null };
      }
      for (let i = 0; i < mirrors.length; i++) {
        const hm = mirrors[i]!;
        hmScanAfter = hm.id;
        lastScannedHm = hm.id;
        const projected = await this.projectHmCandidate(organizationId, hm);
        if (projected) {
          items.push(projected);
        }
        if (items.length >= limit) {
          const moreHm = i < mirrors.length - 1 || mirrors.length === SCAN_BATCH_SIZE;
          const nextCursor = moreHm ? combinedCursor('HIGH_MOBILITY', lastScannedHm!) : null;
          return { items, nextCursor };
        }
      }
      if (mirrors.length < SCAN_BATCH_SIZE) {
        return { items, nextCursor: null };
      }
    }

    return { items, nextCursor: null };
  }

  private async listDimoCandidates(
    organizationId: string,
    limit: number,
    cursor?: ProviderCandidateListCursor,
  ): Promise<ProviderCandidateListDto> {
    let scanAfter = cursor ? scanAfterMirrorId(cursor) : undefined;
    const items: ProviderCandidateDto[] = [];
    let lastScanned: string | undefined;

    while (items.length < limit) {
      const mirrors = await this.prisma.dimoVehicle.findMany({
        where: scanAfter ? { id: { gt: scanAfter } } : undefined,
        orderBy: { id: 'asc' },
        take: SCAN_BATCH_SIZE,
        select: this.dimoSelect(),
      });
      if (mirrors.length === 0) {
        break;
      }
      for (let i = 0; i < mirrors.length; i++) {
        const dimo = mirrors[i]!;
        scanAfter = dimo.id;
        lastScanned = dimo.id;
        const projected = await this.projectDimoCandidate(organizationId, dimo);
        if (projected) {
          items.push(projected);
        }
        if (items.length >= limit) {
          const more = i < mirrors.length - 1 || mirrors.length === SCAN_BATCH_SIZE;
          const nextCursor = more ? providerScopedCursor('DIMO', lastScanned!) : null;
          return { items, nextCursor };
        }
      }
      if (mirrors.length < SCAN_BATCH_SIZE) {
        break;
      }
    }

    return { items, nextCursor: null };
  }

  private async listHmCandidates(
    organizationId: string,
    limit: number,
    cursor?: ProviderCandidateListCursor,
  ): Promise<ProviderCandidateListDto> {
    let scanAfter = cursor ? scanAfterMirrorId(cursor) : undefined;
    const items: ProviderCandidateDto[] = [];
    let lastScanned: string | undefined;

    while (items.length < limit) {
      const mirrors = await this.prisma.highMobilityVehicle.findMany({
        where: {
          ...this.hmBaseWhere(organizationId),
          ...(scanAfter ? { id: { gt: scanAfter } } : {}),
        },
        orderBy: { id: 'asc' },
        take: SCAN_BATCH_SIZE,
        select: this.hmSelect(),
      });
      if (mirrors.length === 0) {
        break;
      }
      for (let i = 0; i < mirrors.length; i++) {
        const hm = mirrors[i]!;
        scanAfter = hm.id;
        lastScanned = hm.id;
        const projected = await this.projectHmCandidate(organizationId, hm);
        if (projected) {
          items.push(projected);
        }
        if (items.length >= limit) {
          const more = i < mirrors.length - 1 || mirrors.length === SCAN_BATCH_SIZE;
          const nextCursor = more ? providerScopedCursor('HIGH_MOBILITY', lastScanned!) : null;
          return { items, nextCursor };
        }
      }
      if (mirrors.length < SCAN_BATCH_SIZE) {
        break;
      }
    }

    return { items, nextCursor: null };
  }

  private hmBaseWhere(organizationId: string): Prisma.HighMobilityVehicleWhereInput {
    return {
      isActive: true,
      clearanceStatus: 'APPROVED',
      OR: [{ organizationId }, { organizationId: null }],
    };
  }

  private dimoSelect() {
    return {
      id: true,
      externalId: true,
      vin: true,
      make: true,
      model: true,
      year: true,
      fuelType: true,
      connectionStatus: true,
      updatedAt: true,
    };
  }

  private hmSelect() {
    return {
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
    };
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
