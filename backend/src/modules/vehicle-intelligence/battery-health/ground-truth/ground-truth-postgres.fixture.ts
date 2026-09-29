import { randomUUID } from 'crypto';
import { PrismaClient, ServiceEventOrigin } from '@prisma/client';
import { PIPELINE_PLAUSIBILITY_KEY } from '@modules/document-extraction/document-content-cache.util';
import { PrismaService } from '@shared/database/prisma.service';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { BatteryGroundTruthBackedSourceGuard } from './ground-truth-backed-source.guard';
import type { CreateServiceEventFromDocumentExtractionInput } from '../../service-events/service-events.service';
import { ServiceEventsService } from '../../service-events/service-events.service';
import { BatteryGroundTruthEmissionService } from './ground-truth-emission.service';
import { BatteryGroundTruthRepository } from './ground-truth.repository';
import { BatteryGroundTruthService } from './ground-truth.service';
import { BatteryGroundTruthSourceResolver } from './ground-truth-source.resolver';

export async function createGtOrgVehicle(prisma: PrismaClient) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `GT ${suffix}`,
      businessType: 'FLEET',
      status: 'ACTIVE',
    },
  });
  const vehicleId = randomUUID();
  const vin = `VIN${suffix}`.slice(0, 17).padEnd(17, '0');
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, hardware_type, status,
      license_plate, created_at, updated_at
    ) VALUES (
      ${vehicleId}::uuid,
      ${org.id}::uuid,
      ${vin},
      'Test',
      'EV',
      2024,
      'ELECTRIC'::"FuelType",
      'LTE_R1'::"HardwareType",
      'AVAILABLE'::"VehicleStatus",
      ${`GT-${suffix}`},
      NOW(),
      NOW()
    )
  `;
  return { organizationId: org.id, vehicleId };
}

export async function createGtTestUser(prisma: PrismaClient, organizationId: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const userId = randomUUID();
  const email = `gt-actor-${suffix}@example.com`;
  const name = `GT Actor ${suffix}`;
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, status, created_at, updated_at)
    VALUES (
      ${userId}::uuid,
      ${email},
      ${name},
      'ACTIVE'::"UserStatus",
      NOW(),
      NOW()
    )
  `;
  await prisma.$executeRaw`
    INSERT INTO organization_memberships (
      id, user_id, organization_id, role, status, permissions, created_at, updated_at
    ) VALUES (
      ${randomUUID()}::uuid,
      ${userId}::uuid,
      ${organizationId}::uuid,
      'ORG_ADMIN'::"MembershipRole",
      'ACTIVE'::"MembershipStatus",
      ${JSON.stringify({ fleet: { read: true, write: true } })}::jsonb,
      NOW(),
      NOW()
    )
  `;
  return { id: userId, email, name };
}

export function buildGroundTruthStack(prisma: PrismaClient) {
  const prismaService = prisma as unknown as PrismaService;
  const gtRepo = new BatteryGroundTruthRepository(prismaService);
  const resolver = new BatteryGroundTruthSourceResolver(prismaService);
  const gtService = new BatteryGroundTruthService(prismaService, gtRepo, resolver);
  const emission = new BatteryGroundTruthEmissionService(prismaService, gtService, gtRepo);
  const guard = new BatteryGroundTruthBackedSourceGuard(prismaService);
  return { gtRepo, gtService, emission, guard, resolver };
}

export async function assertGtPostgresReachable() {
  const ok = await probePostgresDatabase();
  if (!ok) throw new Error('DATABASE_URL not reachable');
}

export function buildActionPlanPlausibility(actionPlan: {
  confirmedAt: string;
  fingerprint: string;
  confirmedById?: string | null;
}) {
  return {
    [PIPELINE_PLAUSIBILITY_KEY]: { actionPlan },
  };
}

/** Raw-SQL service-event helper for Postgres CI where Prisma selects columns absent from ephemeral DB. */
export function createGtDocumentServiceEventsService(
  prisma: PrismaClient,
  guard: BatteryGroundTruthBackedSourceGuard,
): ServiceEventsService {
  const prismaService = prisma as unknown as PrismaService;
  const base = new ServiceEventsService(
    prismaService,
    { onServiceHistoryChanged: jest.fn().mockResolvedValue(undefined) } as any,
    guard,
  );
  return {
    ...base,
    async findByDocumentExtractionId(organizationId: string, documentExtractionId: string) {
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM vehicle_service_events
        WHERE organization_id = ${organizationId}::uuid
          AND document_extraction_id = ${documentExtractionId}::uuid
        LIMIT 1
      `;
      return rows[0] ? ({ id: rows[0].id } as any) : null;
    },
    async createFromDocumentExtraction(input: CreateServiceEventFromDocumentExtractionInput) {
      const existing = await this.findByDocumentExtractionId(
        input.organizationId,
        input.documentExtractionId,
      );
      if (existing) {
        return existing as any;
      }
      const id = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO vehicle_service_events (
          id, vehicle_id, organization_id, event_type, event_date, origin,
          document_extraction_id, created_at, updated_at
        ) VALUES (
          ${id}::uuid,
          ${input.vehicleId}::uuid,
          ${input.organizationId}::uuid,
          ${input.eventType}::"ServiceEventType",
          ${new Date(input.eventDate)},
          ${ServiceEventOrigin.AI_UPLOAD}::"ServiceEventOrigin",
          ${input.documentExtractionId}::uuid,
          NOW(),
          NOW()
        )
      `;
      return { id } as any;
    },
  } as ServiceEventsService;
}
