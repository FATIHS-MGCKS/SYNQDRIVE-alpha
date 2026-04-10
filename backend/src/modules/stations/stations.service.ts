import { Injectable } from '@nestjs/common';
import { Station, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

const STATION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

@Injectable()
export class StationsService {
  constructor(private readonly prisma: PrismaService) {}

  private withTenantScope(organizationId: string) {
    return { organizationId };
  }

  async create(organizationId: string, data: Omit<Prisma.StationCreateInput, 'organization'>): Promise<Station> {
    return this.prisma.station.create({
      data: { ...data, organization: { connect: { id: organizationId } } },
    });
  }

  async findAll(organizationId: string) {
    const stations = await this.prisma.station.findMany({
      where: this.withTenantScope(organizationId),
      include: {
        _count: { select: { vehicles: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return stations.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      city: s.city,
      country: s.country,
      latitude: s.latitude,
      longitude: s.longitude,
      status: STATION_STATUS_LABELS[s.status] ?? s.status,
      vehicleCount: s._count.vehicles,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async findOne(organizationId: string, id: string): Promise<Station | null> {
    return this.prisma.station.findFirst({
      where: { id, ...this.withTenantScope(organizationId) },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: Prisma.StationUpdateInput,
  ): Promise<Station> {
    await this.prisma.station.findFirstOrThrow({
      where: { id, ...this.withTenantScope(organizationId) },
    });
    return this.prisma.station.update({ where: { id }, data });
  }

  async delete(organizationId: string, id: string): Promise<Station> {
    await this.prisma.station.findFirstOrThrow({
      where: { id, ...this.withTenantScope(organizationId) },
    });
    return this.prisma.station.delete({ where: { id } });
  }

  async getStationStats(organizationId: string) {
    const stations = await this.prisma.station.findMany({
      where: this.withTenantScope(organizationId),
      include: {
        _count: { select: { vehicles: true } },
      },
      orderBy: { name: 'asc' },
    });

    const totalVehicles = stations.reduce((sum, s) => sum + s._count.vehicles, 0);

    return {
      totalStations: stations.length,
      totalVehicles,
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        status: STATION_STATUS_LABELS[s.status] ?? s.status,
        vehicleCount: s._count.vehicles,
      })),
    };
  }
}
