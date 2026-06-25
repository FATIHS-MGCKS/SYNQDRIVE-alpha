import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ComplaintLifecycleStatus,
  DamageType,
  Prisma,
  ServiceCaseCategory,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { ServiceCasesService } from '../service-cases/service-cases.service';
import { DamagesService } from '../vehicle-intelligence/damages/damages.service';
import {
  ACTIVE_OBSERVATION_DB_STATUSES,
  mapObservationRow,
  parseAffectedArea,
  parseCategory,
  parseSeverity,
  parseSource,
  parseStatus,
  type TechnicalObservationDto,
} from './technical-observations.mapper';
import type {
  ConvertObservationToTaskDto,
  CreateTechnicalObservationDto,
  LinkObservationDamageDto,
  LinkObservationServiceDto,
  ListTechnicalObservationsQueryDto,
  UpdateTechnicalObservationDto,
} from './dto/technical-observation.dto';

const HISTORY_STATUSES: ComplaintLifecycleStatus[] = [
  'RESOLVED',
  'DISMISSED',
  'REJECTED',
  'CONVERTED',
];

@Injectable()
export class TechnicalObservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly serviceCases: ServiceCasesService,
    private readonly damages: DamagesService,
  ) {}

  async list(
    orgId: string,
    vehicleId: string,
    query: ListTechnicalObservationsQueryDto = {},
  ): Promise<{ active: TechnicalObservationDto[]; history: TechnicalObservationDto[] }> {
    await this.assertVehicleInOrg(orgId, vehicleId);

    const where: Prisma.VehicleComplaintWhereInput = {
      organizationId: orgId,
      vehicleId,
    };

    if (query.bookingId) where.bookingId = query.bookingId;
    if (query.source) where.source = parseSource(query.source);
    if (query.severity) where.urgency = parseSeverity(query.severity);
    if (query.category) {
      const cat = parseCategory(query.category);
      if (cat) where.category = cat;
    }

    const scope = query.scope ?? 'all';
    if (query.status) {
      const dbStatus = parseStatus(query.status);
      if (!dbStatus) throw new BadRequestException('Invalid status filter');
      where.status = dbStatus;
    } else if (scope === 'active') {
      where.status = { in: ACTIVE_OBSERVATION_DB_STATUSES };
    } else if (scope === 'history') {
      where.status = { in: HISTORY_STATUSES };
    }

    const rows = await this.prisma.vehicleComplaint.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const mapped = rows.map(mapObservationRow);
    if (scope === 'all' && !query.status) {
      return {
        active: mapped.filter((o) =>
          ACTIVE_OBSERVATION_DB_STATUSES.includes(
            rows.find((r) => r.id === o.id)!.status,
          ),
        ),
        history: mapped.filter(
          (o) =>
            !ACTIVE_OBSERVATION_DB_STATUSES.includes(
              rows.find((r) => r.id === o.id)!.status,
            ),
        ),
      };
    }

    const isActiveScope =
      scope === 'active' ||
      (query.status &&
        ACTIVE_OBSERVATION_DB_STATUSES.includes(parseStatus(query.status)!));

    return {
      active: isActiveScope ? mapped : [],
      history: isActiveScope ? [] : mapped,
    };
  }

  async create(
    orgId: string,
    vehicleId: string,
    body: CreateTechnicalObservationDto,
    createdByUserId?: string,
  ): Promise<TechnicalObservationDto> {
    await this.assertVehicleInOrg(orgId, vehicleId);
    await this.validateContextLinks(orgId, vehicleId, body);

    const description = body.description.trim();
    const title = body.title?.trim() || null;
    const initialStatus: ComplaintLifecycleStatus = 'ACTIVE';

    const row = await this.prisma.vehicleComplaint.create({
      data: {
        organizationId: orgId,
        vehicleId,
        createdByUserId: createdByUserId ?? null,
        createdByWorkerId: body.createdByWorkerId?.trim() || null,
        title,
        description,
        urgency: parseSeverity(body.severity),
        region: body.region?.trim() || null,
        category: parseCategory(body.category),
        affectedArea: parseAffectedArea(body.affectedArea),
        status: initialStatus,
        source: parseSource(body.source),
        blocksRental: body.blocksRental ?? false,
        bookingId: body.bookingId ?? null,
        customerId: body.customerId ?? null,
        driverId: body.driverId ?? null,
        handoverProtocolId: body.handoverProtocolId ?? null,
        stationId: body.stationId ?? null,
        locationContext: body.locationContext?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    });

    return mapObservationRow(row);
  }

  async update(
    orgId: string,
    vehicleId: string,
    observationId: string,
    body: UpdateTechnicalObservationDto,
  ): Promise<TechnicalObservationDto> {
    const existing = await this.getScopedRow(orgId, vehicleId, observationId);

    const data: Prisma.VehicleComplaintUpdateInput = {};
    if (body.description !== undefined) data.description = body.description.trim();
    if (body.title !== undefined) data.title = body.title.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes.trim() || null;
    if (body.region !== undefined) data.region = body.region.trim() || null;
    if (body.severity !== undefined) data.urgency = parseSeverity(body.severity);
    if (body.category !== undefined) data.category = parseCategory(body.category);
    if (body.affectedArea !== undefined) {
      data.affectedArea = parseAffectedArea(body.affectedArea);
    }
    if (body.blocksRental !== undefined) data.blocksRental = body.blocksRental;
    if (body.status !== undefined) {
      const next = parseStatus(body.status);
      if (!next) throw new BadRequestException('Invalid status');
      data.status = next;
      if (next === 'RESOLVED') data.resolvedAt = new Date();
      if (next === 'DISMISSED') data.dismissedAt = new Date();
    }

    const row = await this.prisma.vehicleComplaint.update({
      where: { id: existing.id },
      data,
    });
    return mapObservationRow(row);
  }

  async resolve(
    orgId: string,
    vehicleId: string,
    observationId: string,
    resolvedByUserId?: string,
  ): Promise<TechnicalObservationDto> {
    await this.getScopedRow(orgId, vehicleId, observationId);
    const row = await this.prisma.vehicleComplaint.update({
      where: { id: observationId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedByUserId: resolvedByUserId ?? null,
        blocksRental: false,
      },
    });
    return mapObservationRow(row);
  }

  async dismiss(
    orgId: string,
    vehicleId: string,
    observationId: string,
    dismissedByUserId?: string,
  ): Promise<TechnicalObservationDto> {
    await this.getScopedRow(orgId, vehicleId, observationId);
    const row = await this.prisma.vehicleComplaint.update({
      where: { id: observationId },
      data: {
        status: 'DISMISSED',
        dismissedAt: new Date(),
        dismissedByUserId: dismissedByUserId ?? null,
        blocksRental: false,
      },
    });
    return mapObservationRow(row);
  }

  async convertToTask(
    orgId: string,
    vehicleId: string,
    observationId: string,
    body: ConvertObservationToTaskDto,
    actorUserId?: string,
  ): Promise<{ observation: TechnicalObservationDto; taskId: string }> {
    const existing = await this.getScopedRow(orgId, vehicleId, observationId);
    if (existing.convertedToTaskId) {
      throw new BadRequestException('Observation already converted to a task');
    }

    const title =
      body.title?.trim() ||
      existing.title?.trim() ||
      `Technical observation: ${existing.description.slice(0, 72)}${existing.description.length > 72 ? '…' : ''}`;

    const task = await this.tasks.createManualTask(
      orgId,
      {
        title,
        description: body.description ?? existing.description,
        category: 'TECHNICAL_OBSERVATION',
        type: 'CUSTOM',
        source: 'TECHNICAL_OBSERVATION',
        sourceType: 'HEALTH',
        priority:
          existing.urgency === 'CRITICAL'
            ? 'CRITICAL'
            : existing.urgency === 'HIGH'
              ? 'HIGH'
              : existing.urgency === 'LOW'
                ? 'LOW'
                : 'NORMAL',
        vehicleId,
        bookingId: existing.bookingId ?? undefined,
        customerId: existing.customerId ?? undefined,
        blocksVehicleAvailability:
          body.blocksVehicleAvailability ?? existing.blocksRental,
        metadata: {
          technicalObservationId: existing.id,
        },
      },
      actorUserId,
    );

    const row = await this.prisma.vehicleComplaint.update({
      where: { id: observationId },
      data: {
        convertedToTaskId: task.id,
        linkedServiceTaskId: task.id,
        status: 'CONVERTED',
      },
    });

    return { observation: mapObservationRow(row), taskId: task.id };
  }

  async linkDamage(
    orgId: string,
    vehicleId: string,
    observationId: string,
    body: LinkObservationDamageDto,
  ): Promise<TechnicalObservationDto> {
    const existing = await this.getScopedRow(orgId, vehicleId, observationId);

    let damageId = body.damageId ?? existing.linkedDamageId ?? null;

    if (body.createDamage) {
      const created = await this.damages.create(
        vehicleId,
        {
          damageType: DamageType.OTHER,
          description:
            body.damageDescription?.trim() ||
            existing.description ||
            'Linked from technical observation',
          bookingId: existing.bookingId ?? undefined,
          customerId: existing.customerId ?? undefined,
          handoverProtocolId: existing.handoverProtocolId ?? undefined,
        },
        orgId,
      );
      damageId = created.id;
    } else if (damageId) {
      const damage = await this.prisma.vehicleDamage.findFirst({
        where: {
          id: damageId,
          vehicleId,
          vehicle: { organizationId: orgId },
        },
        select: { id: true },
      });
      if (!damage) {
        throw new BadRequestException('Damage not found for this vehicle in organization');
      }
    } else {
      throw new BadRequestException('damageId or createDamage is required');
    }

    const row = await this.prisma.vehicleComplaint.update({
      where: { id: observationId },
      data: { linkedDamageId: damageId },
    });
    return mapObservationRow(row);
  }

  async linkService(
    orgId: string,
    vehicleId: string,
    observationId: string,
    body: LinkObservationServiceDto,
  ): Promise<TechnicalObservationDto> {
    const existing = await this.getScopedRow(orgId, vehicleId, observationId);
    const data: Prisma.VehicleComplaintUpdateInput = {};

    if (body.serviceEventId) {
      const event = await this.prisma.vehicleServiceEvent.findFirst({
        where: { id: body.serviceEventId, vehicleId },
        select: { id: true },
      });
      if (!event) {
        throw new BadRequestException('Service event not found for this vehicle');
      }
      data.linkedServiceEventId = body.serviceEventId;
    }

    if (body.serviceTaskId) {
      const task = await this.prisma.orgTask.findFirst({
        where: { id: body.serviceTaskId, organizationId: orgId, vehicleId },
        select: { id: true },
      });
      if (!task) {
        throw new BadRequestException('Service task not found for this vehicle in organization');
      }
      data.linkedServiceTaskId = body.serviceTaskId;
    }

    if (body.createServiceCase) {
      const serviceCase = await this.serviceCases.create(
        orgId,
        {
          title:
            body.serviceCaseTitle?.trim() ||
            existing.title?.trim() ||
            `Observation: ${existing.description.slice(0, 64)}`,
          description: existing.description,
          category: ServiceCaseCategory.DIAGNOSTIC,
          vehicleId,
          blocksRental: existing.blocksRental,
          metadata: { technicalObservationId: existing.id },
        },
      );
      data.linkedServiceCaseId = serviceCase.id;
    }

    if (
      !body.serviceEventId &&
      !body.serviceTaskId &&
      !body.createServiceCase
    ) {
      throw new BadRequestException(
        'serviceEventId, serviceTaskId, or createServiceCase is required',
      );
    }

    const row = await this.prisma.vehicleComplaint.update({
      where: { id: observationId },
      data,
    });
    return mapObservationRow(row);
  }

  private async getScopedRow(
    orgId: string,
    vehicleId: string,
    observationId: string,
  ) {
    const row = await this.prisma.vehicleComplaint.findFirst({
      where: { id: observationId, organizationId: orgId, vehicleId },
    });
    if (!row) {
      throw new NotFoundException('Technical observation not found');
    }
    return row;
  }

  private async assertVehicleInOrg(orgId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
  }

  private async validateContextLinks(
    orgId: string,
    vehicleId: string,
    body: Pick<
      CreateTechnicalObservationDto,
      'bookingId' | 'customerId' | 'driverId' | 'handoverProtocolId' | 'stationId'
    >,
  ) {
    if (body.bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: body.bookingId, organizationId: orgId, vehicleId },
        select: { id: true },
      });
      if (!booking) {
        throw new BadRequestException('bookingId does not match vehicle/org');
      }
    }

    if (body.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: body.customerId, organizationId: orgId },
        select: { id: true },
      });
      if (!customer) {
        throw new BadRequestException('customerId not found in organization');
      }
    }

    if (body.handoverProtocolId) {
      const protocol = await this.prisma.bookingHandoverProtocol.findFirst({
        where: {
          id: body.handoverProtocolId,
          booking: { organizationId: orgId, vehicleId },
        },
        select: { id: true },
      });
      if (!protocol) {
        throw new BadRequestException('handoverProtocolId does not match vehicle/org');
      }
    }

    if (body.stationId) {
      const station = await this.prisma.station.findFirst({
        where: { id: body.stationId, organizationId: orgId },
        select: { id: true },
      });
      if (!station) {
        throw new BadRequestException('stationId not found in organization');
      }
    }

    if (body.driverId) {
      const driver = await this.prisma.customer.findFirst({
        where: { id: body.driverId, organizationId: orgId },
        select: { id: true },
      });
      if (!driver) {
        throw new BadRequestException('driverId not found in organization');
      }
    }
  }
}
