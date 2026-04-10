import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, data: any) {
    const { vehicleIds, ...vendorData } = data;
    const vendor = await this.prisma.vendor.create({
      data: {
        ...vendorData,
        organization: { connect: { id: orgId } },
      },
      include: { vendorVehicles: { include: { vehicle: true } } },
    });

    if (vehicleIds?.length) {
      await this.prisma.vendorVehicle.createMany({
        data: vehicleIds.map((vehicleId: string) => ({
          vendorId: vendor.id,
          vehicleId,
        })),
        skipDuplicates: true,
      });
      return this.findById(orgId, vendor.id);
    }

    return vendor;
  }

  async findAll(orgId: string) {
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        vendorVehicles: {
          include: {
            vehicle: { select: { id: true, make: true, model: true, licensePlate: true, year: true } },
          },
        },
      },
    });

    return vendors.map((v) => ({
      ...v,
      linkedVehicles: v.vendorVehicles.map((vv) => vv.vehicle),
      linkedVehicleCount: v.vendorVehicles.length,
      vendorVehicles: undefined,
    }));
  }

  async findById(orgId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId: orgId },
      include: {
        vendorVehicles: {
          include: {
            vehicle: { select: { id: true, make: true, model: true, licensePlate: true, year: true, vin: true } },
          },
        },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return {
      ...vendor,
      linkedVehicles: vendor.vendorVehicles.map((vv) => ({ ...vv.vehicle, vendorVehicleId: vv.id, notes: vv.notes })),
      linkedVehicleCount: vendor.vendorVehicles.length,
      vendorVehicles: undefined,
    };
  }

  async update(orgId: string, id: string, data: any) {
    await this.prisma.vendor.findFirstOrThrow({ where: { id, organizationId: orgId } });
    const { vehicleIds, ...vendorData } = data;

    await this.prisma.vendor.update({ where: { id }, data: vendorData });

    if (vehicleIds !== undefined) {
      await this.prisma.vendorVehicle.deleteMany({ where: { vendorId: id } });
      if (vehicleIds.length) {
        await this.prisma.vendorVehicle.createMany({
          data: vehicleIds.map((vehicleId: string) => ({ vendorId: id, vehicleId })),
          skipDuplicates: true,
        });
      }
    }

    return this.findById(orgId, id);
  }

  async remove(orgId: string, id: string) {
    await this.prisma.vendor.findFirstOrThrow({ where: { id, organizationId: orgId } });
    await this.prisma.vendor.delete({ where: { id } });
    return { success: true };
  }

  async linkVehicle(orgId: string, vendorId: string, vehicleId: string, notes?: string) {
    await this.prisma.vendor.findFirstOrThrow({ where: { id: vendorId, organizationId: orgId } });
    await this.prisma.vehicle.findFirstOrThrow({ where: { id: vehicleId, organizationId: orgId } });
    const link = await this.prisma.vendorVehicle.upsert({
      where: { vendorId_vehicleId: { vendorId, vehicleId } },
      create: { vendorId, vehicleId, notes },
      update: { notes },
      include: { vehicle: { select: { id: true, make: true, model: true, licensePlate: true, year: true } } },
    });
    return link;
  }

  async unlinkVehicle(orgId: string, vendorId: string, vehicleId: string) {
    await this.prisma.vendor.findFirstOrThrow({ where: { id: vendorId, organizationId: orgId } });
    await this.prisma.vendorVehicle.delete({
      where: { vendorId_vehicleId: { vendorId, vehicleId } },
    });
    return { success: true };
  }

  async getStats(orgId: string) {
    const [total, active, byCategory] = await Promise.all([
      this.prisma.vendor.count({ where: { organizationId: orgId } }),
      this.prisma.vendor.count({ where: { organizationId: orgId, isActive: true } }),
      this.prisma.vendor.groupBy({
        by: ['category'],
        where: { organizationId: orgId, isActive: true },
        _count: true,
      }),
    ]);
    return {
      total,
      active,
      inactive: total - active,
      byCategory: byCategory.reduce((acc, g) => ({ ...acc, [g.category]: g._count }), {}),
    };
  }

  async searchPlaces(query: string) {
    if (!query || query.length < 2) return [];

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return [];

    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=establishment&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== 'OK') return [];

      return data.predictions.map((p: any) => ({
        placeId: p.place_id,
        name: p.structured_formatting?.main_text ?? p.description,
        address: p.structured_formatting?.secondary_text ?? '',
        description: p.description,
      }));
    } catch {
      return [];
    }
  }

  async getPlaceDetails(placeId: string) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return null;

    try {
      const fields = 'name,formatted_address,formatted_phone_number,website,geometry,address_components,types,url';
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== 'OK' || !data.result) return null;

      const r = data.result;
      const components = r.address_components ?? [];
      const getComponent = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name ?? null;

      return {
        name: r.name ?? null,
        street: [getComponent('route'), getComponent('street_number')].filter(Boolean).join(' ') || null,
        city: getComponent('locality') ?? getComponent('sublocality') ?? null,
        postalCode: getComponent('postal_code') ?? null,
        country: getComponent('country') ?? null,
        phone: r.formatted_phone_number ?? null,
        website: r.website ?? null,
        latitude: r.geometry?.location?.lat ?? null,
        longitude: r.geometry?.location?.lng ?? null,
        googleMapsUrl: r.url ?? null,
        types: r.types ?? [],
      };
    } catch {
      return null;
    }
  }
}
