import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MisuseAttributionScope,
  Prisma,
  TripAssignmentStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildPaginatedResult,
  parsePagination,
  PaginationParams,
} from '@shared/utils/pagination';
import { CATEGORY_LABELS, CASE_TYPE_LABELS } from './misuse-case.types';

export interface ListMisuseCasesQuery extends PaginationParams {
  vehicleId?: string;
  tripId?: string;
  bookingId?: string;
  customerId?: string;
  category?: string;
  type?: string;
  severity?: string;
}

@Injectable()
export class MisuseCasesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, query: ListMisuseCasesQuery = {}) {
    const { skip, take } = parsePagination(query);
    const where: Prisma.MisuseCaseWhereInput = { organizationId: orgId };

    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.tripId) where.tripId = query.tripId;
    if (query.bookingId) where.bookingId = query.bookingId;

    if (query.customerId) {
      where.customerId = query.customerId;
      where.attributionScope = MisuseAttributionScope.BOOKING_CUSTOMER;
      where.assignmentStatusSnapshot = TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER;
      where.isPrivateTripSnapshot = false;
    }

    if (query.category) where.category = query.category as any;
    if (query.type) where.type = query.type as any;
    if (query.severity) where.severity = query.severity as any;

    const [data, total] = await Promise.all([
      this.prisma.misuseCase.findMany({
        where,
        skip,
        take,
        orderBy: { lastDetectedAt: 'desc' },
        include: {
          evidence: { orderBy: { occurredAt: 'desc' }, take: 10 },
        },
      }),
      this.prisma.misuseCase.count({ where }),
    ]);

    const mapped = data.map((row) => this.toReadModel(row));
    return buildPaginatedResult(mapped, total, query);
  }

  async getById(orgId: string, id: string) {
    const row = await this.prisma.misuseCase.findFirst({
      where: { id, organizationId: orgId },
      include: { evidence: { orderBy: { occurredAt: 'desc' } } },
    });
    if (!row) throw new NotFoundException('Misuse case not found');
    return this.toReadModel(row);
  }

  private toReadModel(
    row: Prisma.MisuseCaseGetPayload<{ include: { evidence: true } }>,
  ) {
    const evidenceSummary = row.evidenceSummary as Record<string, unknown> | null;
    const evidenceCase = evidenceSummary?.evidenceCase ?? null;
    return {
      ...row,
      categoryLabel: CATEGORY_LABELS[row.category],
      typeLabel: CASE_TYPE_LABELS[row.type],
      attributionLabel: this.attributionLabel(row.attributionScope, row.isPrivateTripSnapshot),
      evidenceCase,
    };
  }

  private attributionLabel(
    scope: MisuseAttributionScope,
    isPrivate: boolean,
  ): string {
    if (isPrivate || scope === MisuseAttributionScope.PRIVATE_UNASSIGNED) {
      return 'Nicht kundenzugeordnet / Privat';
    }
    if (scope === MisuseAttributionScope.UNKNOWN) return 'Zuordnung unbekannt';
    if (scope === MisuseAttributionScope.BOOKING_CUSTOMER) return 'Buchungskunde';
    if (scope === MisuseAttributionScope.ASSIGNED_DRIVER) return 'Zugewiesener Fahrer';
    return 'Fahrzeugbezogen';
  }
}
