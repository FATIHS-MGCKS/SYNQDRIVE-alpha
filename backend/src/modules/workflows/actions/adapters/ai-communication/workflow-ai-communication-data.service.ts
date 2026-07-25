import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import {
  WORKFLOW_AI_EVENT_PAYLOAD_ALLOWLIST,
} from './workflow-ai-communication.config';
import type { WorkflowAiCommunicationFact } from './workflow-ai-communication.types';

@Injectable()
export class WorkflowAiCommunicationDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalHealth: RentalHealthService,
  ) {}

  async collectFacts(input: {
    organizationId: string;
    eventType: string;
    eventPayload: Record<string, unknown>;
    bookingId?: string;
    customerId?: string;
    vehicleId?: string;
    entityType?: string | null;
    entityId?: string | null;
  }): Promise<WorkflowAiCommunicationFact[]> {
    const facts: WorkflowAiCommunicationFact[] = [];
    let seq = 0;
    const add = (
      category: WorkflowAiCommunicationFact['category'],
      label: string,
      value: string,
      symptomOnly = false,
    ) => {
      if (!value.trim()) return;
      facts.push({
        id: `f${++seq}`,
        category,
        label,
        value: value.trim().slice(0, 280),
        symptomOnly,
      });
    };

    const allowlist = WORKFLOW_AI_EVENT_PAYLOAD_ALLOWLIST[input.eventType] ?? [];
    for (const key of allowlist) {
      const raw = input.eventPayload[key];
      if (raw == null) continue;
      if (Array.isArray(raw)) {
        add('event', key, raw.map(String).join('; ').slice(0, 280), key.includes('dtc') || key.includes('alert'));
      } else if (typeof raw === 'object') {
        add('event', key, JSON.stringify(raw).slice(0, 280), true);
      } else {
        add('event', key, String(raw), key.includes('dtc') || key.includes('alert'));
      }
    }

    const bookingId =
      input.bookingId
      ?? (input.entityType === 'booking' ? input.entityId ?? undefined : undefined)
      ?? (typeof input.eventPayload.bookingId === 'string' ? input.eventPayload.bookingId : undefined);

    const customerId =
      input.customerId
      ?? (input.entityType === 'customer' ? input.entityId ?? undefined : undefined)
      ?? (typeof input.eventPayload.customerId === 'string' ? input.eventPayload.customerId : undefined);

    const vehicleId =
      input.vehicleId
      ?? (input.entityType === 'vehicle' ? input.entityId ?? undefined : undefined)
      ?? (typeof input.eventPayload.vehicleId === 'string' ? input.eventPayload.vehicleId : undefined);

    if (bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: bookingId, organizationId: input.organizationId },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          customerId: true,
        },
      });
      if (!booking) {
        throw new NotFoundException('Booking not found in organization');
      }
      add('booking', 'booking_reference', booking.id.slice(0, 8));
      if (booking.startDate) add('booking', 'booking_start', booking.startDate.toISOString().slice(0, 10));
      if (booking.endDate) add('booking', 'booking_end', booking.endDate.toISOString().slice(0, 10));
    }

    const resolvedCustomerId = customerId
      ?? (bookingId
        ? (
            await this.prisma.booking.findFirst({
              where: { id: bookingId, organizationId: input.organizationId },
              select: { customerId: true },
            })
          )?.customerId
        : undefined);

    if (resolvedCustomerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: resolvedCustomerId, organizationId: input.organizationId },
        select: { firstName: true },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found in organization');
      }
      if (customer.firstName?.trim()) {
        add('customer', 'customer_first_name', customer.firstName.trim());
      }
    }

    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId: input.organizationId },
        select: { make: true, model: true, licensePlate: true },
      });
      if (!vehicle) {
        throw new NotFoundException('Vehicle not found in organization');
      }
      add('vehicle_health', 'vehicle_make_model', `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim());
      if (vehicle.licensePlate) {
        add('vehicle_health', 'vehicle_plate_partial', `${vehicle.licensePlate.slice(0, 3)}***`);
      }

      try {
        const health = await this.rentalHealth.getVehicleHealth(input.organizationId, vehicleId);
        add('vehicle_health', 'overall_health_state', health.overall_state, true);
        for (const [moduleKey, module] of Object.entries(health.modules)) {
          const mod = module as { state?: string; reason?: string };
          if (!mod || mod.state === 'unknown' || mod.state === 'n_a') continue;
          if (mod.reason) {
            add(
              'vehicle_health',
              `${moduleKey}_alert`,
              `${mod.state}: ${mod.reason}`,
              true,
            );
          }
        }
      } catch {
        // Health unavailable — continue with event facts only
      }
    }

    return facts;
  }
}
