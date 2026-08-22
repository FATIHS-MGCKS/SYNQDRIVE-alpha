import { Injectable } from '@nestjs/common';
import type { Booking, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeEmail } from '@modules/customers/utils/customer-normalizer.util';
import type { ConversationContextPatch } from '../normalization/communication-normalization.types';
import { conversationToContextPatch } from '../normalization/communication-context-merge';
import type { CommunicationConversation } from '@prisma/client';
import {
  COMMUNICATION_CONTEXT_FIELDS,
  CommunicationContextAmbiguityReason,
  CommunicationContextConflict,
  CommunicationContextResolutionByField,
  CommunicationContextResolutionResult,
  CommunicationContextResolutionSource,
  CommunicationContextResolverInput,
  CommunicationContextField,
  ResolvedContextField,
} from './communication-context.types';
import {
  COMMUNICATION_ELIGIBLE_BOOKING_STATUSES,
  isBookingEligibleForCommunicationResolution,
} from './booking-eligibility.util';
import { communicationContextSourceStrength } from './communication-context-source.util';

type Tx = Prisma.TransactionClient | PrismaService;

@Injectable()
export class CommunicationContextResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    input: CommunicationContextResolverInput,
    tx?: Tx,
  ): Promise<CommunicationContextResolutionResult> {
    const client = tx ?? this.prisma;
    const existing = input.existingCanonical ?? {};
    const native = input.nativeContext ?? {};
    const hints = input.identityHints ?? {};
    const resolved: CommunicationContextResolutionByField = {};
    const conflicts: CommunicationContextConflict[] = [];

    const customer = await this.resolveCustomer(
      client,
      input,
      existing,
      native,
      hints,
      resolved,
      conflicts,
    );

    await this.resolveBooking(
      client,
      input,
      existing,
      native,
      customer,
      resolved,
      conflicts,
    );

    await this.resolveVehicle(client, input, existing, native, resolved, conflicts);
    await this.resolveStation(client, input, existing, native, resolved, conflicts);
    this.resolveUserAgent(existing, native, resolved, conflicts);

    const patch = this.buildEnrichmentPatch(existing, resolved);
    return { resolved, patch, conflicts };
  }

  private async resolveCustomer(
    client: Tx,
    input: CommunicationContextResolverInput,
    existing: ConversationContextPatch,
    native: NonNullable<CommunicationContextResolverInput['nativeContext']>,
    hints: NonNullable<CommunicationContextResolverInput['identityHints']>,
    resolved: CommunicationContextResolutionByField,
    conflicts: CommunicationContextConflict[],
  ): Promise<string | null> {
    const existingCustomerId = existing.customerId ?? null;

    if (existingCustomerId) {
      const valid = await this.customerBelongsToOrg(client, input.organizationId, existingCustomerId);
      if (valid) {
        resolved.customerId = {
          value: existingCustomerId,
          source: CommunicationContextResolutionSource.EXISTING_CANONICAL,
        };
      }
    }

    if (native.customerId) {
      const valid = await this.customerBelongsToOrg(
        client,
        input.organizationId,
        native.customerId,
      );
      if (valid) {
        this.setField(resolved, 'customerId', {
          value: native.customerId,
          source: CommunicationContextResolutionSource.NATIVE_RELATION,
        });
        if (existingCustomerId && existingCustomerId !== native.customerId) {
          conflicts.push({
            field: 'customerId',
            code: 'EXISTING_CANONICAL_OVERRIDDEN_BY_NATIVE',
          });
        }
        return native.customerId;
      }
      conflicts.push({
        field: 'customerId',
        code: CommunicationContextAmbiguityReason.CROSS_ORG_REFERENCE,
      });
    }

    if (resolved.customerId?.value) {
      return resolved.customerId.value;
    }

    const phoneCustomerId = await this.resolveCustomerByPhone(
      client,
      input.organizationId,
      hints.normalizedPhone,
    );
    const emailCustomerId = await this.resolveCustomerByEmail(
      client,
      input.organizationId,
      hints.normalizedEmail,
    );

    if (phoneCustomerId && emailCustomerId && phoneCustomerId !== emailCustomerId) {
      conflicts.push({
        field: 'customerId',
        code: CommunicationContextAmbiguityReason.CONFLICTING_IDENTITIES,
      });
      return null;
    }

    if (phoneCustomerId) {
      this.setField(resolved, 'customerId', {
        value: phoneCustomerId,
        source: CommunicationContextResolutionSource.EXACT_PHONE,
      });
      return phoneCustomerId;
    }

    if (emailCustomerId) {
      this.setField(resolved, 'customerId', {
        value: emailCustomerId,
        source: CommunicationContextResolutionSource.EXACT_EMAIL,
      });
      return emailCustomerId;
    }

    return null;
  }

  private async resolveBooking(
    client: Tx,
    input: CommunicationContextResolverInput,
    existing: ConversationContextPatch,
    native: NonNullable<CommunicationContextResolverInput['nativeContext']>,
    customerId: string | null,
    resolved: CommunicationContextResolutionByField,
    conflicts: CommunicationContextConflict[],
  ): Promise<void> {
    if (existing.bookingId) {
      const booking = await this.loadBookingInOrg(
        client,
        input.organizationId,
        existing.bookingId,
      );
      if (booking) {
        resolved.bookingId = {
          value: existing.bookingId,
          source: CommunicationContextResolutionSource.EXISTING_CANONICAL,
        };
      }
    }

    if (native.bookingId) {
      const booking = await this.loadBookingInOrg(
        client,
        input.organizationId,
        native.bookingId,
      );
      if (booking) {
        this.setField(resolved, 'bookingId', {
          value: native.bookingId,
          source: CommunicationContextResolutionSource.NATIVE_RELATION,
        });
        if (customerId && booking.customerId !== customerId) {
          conflicts.push({
            field: 'bookingId',
            code: 'BOOKING_CUSTOMER_MISMATCH',
          });
        }
        return;
      }
      conflicts.push({
        field: 'bookingId',
        code: CommunicationContextAmbiguityReason.INVALID_NATIVE_REFERENCE,
      });
    }

    if (resolved.bookingId?.value) {
      return;
    }

    if (!customerId) {
      return;
    }

    const eventAt = input.occurredAt ?? new Date();
    const timeWindowBookings = await client.booking.findMany({
      where: {
        organizationId: input.organizationId,
        customerId,
        status: { in: COMMUNICATION_ELIGIBLE_BOOKING_STATUSES },
        startDate: { lte: eventAt },
        endDate: { gte: eventAt },
      },
      select: { id: true, customerId: true },
      take: 3,
    });

    if (timeWindowBookings.length === 1) {
      this.setField(resolved, 'bookingId', {
        value: timeWindowBookings[0].id,
        source: CommunicationContextResolutionSource.BOOKING_TIME_WINDOW,
      });
      return;
    }

    if (timeWindowBookings.length > 1) {
      conflicts.push({
        field: 'bookingId',
        code: CommunicationContextAmbiguityReason.MULTIPLE_BOOKINGS,
      });
    }
  }

  private async resolveVehicle(
    client: Tx,
    input: CommunicationContextResolverInput,
    existing: ConversationContextPatch,
    native: NonNullable<CommunicationContextResolverInput['nativeContext']>,
    resolved: CommunicationContextResolutionByField,
    conflicts: CommunicationContextConflict[],
  ): Promise<void> {
    if (existing.vehicleId) {
      const valid = await this.vehicleBelongsToOrg(
        client,
        input.organizationId,
        existing.vehicleId,
      );
      if (valid) {
        resolved.vehicleId = {
          value: existing.vehicleId,
          source: CommunicationContextResolutionSource.EXISTING_CANONICAL,
        };
      }
    }

    if (native.vehicleId) {
      const valid = await this.vehicleBelongsToOrg(
        client,
        input.organizationId,
        native.vehicleId,
      );
      if (valid) {
        this.setField(resolved, 'vehicleId', {
          value: native.vehicleId,
          source: CommunicationContextResolutionSource.NATIVE_RELATION,
        });
        return;
      }
      conflicts.push({
        field: 'vehicleId',
        code: CommunicationContextAmbiguityReason.CROSS_ORG_REFERENCE,
      });
    }

    if (resolved.vehicleId?.value) {
      return;
    }

    const bookingId = resolved.bookingId?.value ?? existing.bookingId ?? native.bookingId ?? null;
    if (!bookingId) return;

    const booking = await this.loadBookingInOrg(client, input.organizationId, bookingId);
    if (!booking?.vehicleId) return;

    const valid = await this.vehicleBelongsToOrg(
      client,
      input.organizationId,
      booking.vehicleId,
    );
    if (!valid) {
      conflicts.push({
        field: 'vehicleId',
        code: CommunicationContextAmbiguityReason.CROSS_ORG_REFERENCE,
      });
      return;
    }

    this.setField(resolved, 'vehicleId', {
      value: booking.vehicleId,
      source: CommunicationContextResolutionSource.BOOKING_RELATION,
    });
  }

  private async resolveStation(
    client: Tx,
    input: CommunicationContextResolverInput,
    existing: ConversationContextPatch,
    native: NonNullable<CommunicationContextResolverInput['nativeContext']>,
    resolved: CommunicationContextResolutionByField,
    conflicts: CommunicationContextConflict[],
  ): Promise<void> {
    if (existing.stationId) {
      const valid = await this.stationBelongsToOrg(
        client,
        input.organizationId,
        existing.stationId,
      );
      if (valid) {
        resolved.stationId = {
          value: existing.stationId,
          source: CommunicationContextResolutionSource.EXISTING_CANONICAL,
        };
      }
    }

    if (native.stationId) {
      const valid = await this.stationBelongsToOrg(
        client,
        input.organizationId,
        native.stationId,
      );
      if (valid) {
        this.setField(resolved, 'stationId', {
          value: native.stationId,
          source: CommunicationContextResolutionSource.NATIVE_RELATION,
        });
        return;
      }
      conflicts.push({
        field: 'stationId',
        code: CommunicationContextAmbiguityReason.CROSS_ORG_REFERENCE,
      });
    }

    if (resolved.stationId?.value) {
      return;
    }

    const bookingId = resolved.bookingId?.value ?? existing.bookingId ?? native.bookingId ?? null;
    if (!bookingId) return;

    const booking = await this.loadBookingInOrg(client, input.organizationId, bookingId);
    if (!booking) return;

    const stationId = resolveDeterministicBookingStation(booking);
    if (!stationId) {
      conflicts.push({
        field: 'stationId',
        code: CommunicationContextAmbiguityReason.BOOKING_CONTEXT_UNCLEAR,
      });
      return;
    }

    const valid = await this.stationBelongsToOrg(client, input.organizationId, stationId);
    if (!valid) {
      conflicts.push({
        field: 'stationId',
        code: CommunicationContextAmbiguityReason.CROSS_ORG_REFERENCE,
      });
      return;
    }

    this.setField(resolved, 'stationId', {
      value: stationId,
      source: CommunicationContextResolutionSource.BOOKING_RELATION,
    });
  }

  private resolveUserAgent(
    existing: ConversationContextPatch,
    native: NonNullable<CommunicationContextResolverInput['nativeContext']>,
    resolved: CommunicationContextResolutionByField,
    conflicts: CommunicationContextConflict[],
  ): void {
    if (existing.assignedUserId) {
      resolved.assignedUserId = {
        value: existing.assignedUserId,
        source: CommunicationContextResolutionSource.EXISTING_CANONICAL,
      };
    }

    if (native.assignedUserId) {
      this.setField(resolved, 'assignedUserId', {
        value: native.assignedUserId,
        source: CommunicationContextResolutionSource.NATIVE_RELATION,
      });
      if (existing.assignedUserId && existing.assignedUserId !== native.assignedUserId) {
        conflicts.push({ field: 'assignedUserId', code: 'ASSIGNMENT_CONFLICT' });
      }
    }

    if (existing.assignedAgentRef) {
      resolved.assignedAgentRef = {
        value: existing.assignedAgentRef,
        source: CommunicationContextResolutionSource.EXISTING_CANONICAL,
      };
      if (existing.assignedAgentType) {
        resolved.assignedAgentType = {
          value: existing.assignedAgentType,
          source: CommunicationContextResolutionSource.EXISTING_CANONICAL,
        };
      }
    }

    if (native.assignedAgentRef) {
      this.setField(resolved, 'assignedAgentRef', {
        value: native.assignedAgentRef,
        source: CommunicationContextResolutionSource.NATIVE_RELATION,
      });
      if (native.assignedAgentType) {
        this.setField(resolved, 'assignedAgentType', {
          value: native.assignedAgentType,
          source: CommunicationContextResolutionSource.NATIVE_RELATION,
        });
      }
    }
  }

  private buildEnrichmentPatch(
    existing: ConversationContextPatch,
    resolved: CommunicationContextResolutionByField,
  ): ConversationContextPatch {
    const patch: ConversationContextPatch = {};
    for (const field of COMMUNICATION_CONTEXT_FIELDS) {
      const current = existing[field] ?? null;
      const next = resolved[field];
      if (!next?.value) continue;
      if (current === next.value) continue;
      patch[field] = next.value;
    }
    return patch;
  }

  private setField(
    resolved: CommunicationContextResolutionByField,
    field: CommunicationContextField,
    entry: ResolvedContextField,
  ): void {
    const incumbent = resolved[field];
    if (!incumbent) {
      resolved[field] = entry;
      return;
    }
    if (
      communicationContextSourceStrength(entry.source)
      >= communicationContextSourceStrength(incumbent.source)
    ) {
      resolved[field] = entry;
    }
  }

  private async resolveCustomerByPhone(
    client: Tx,
    organizationId: string,
    normalizedPhone?: string | null,
  ): Promise<string | null> {
    const phone = normalizedPhone?.trim();
    if (!phone) return null;

    const matches = await client.customer.findMany({
      where: {
        organizationId,
        archivedAt: null,
        phoneNormalized: phone,
      },
      select: { id: true },
      take: 2,
    });

    if (matches.length === 1) return matches[0].id;
    return null;
  }

  private async resolveCustomerByEmail(
    client: Tx,
    organizationId: string,
    normalizedEmail?: string | null,
  ): Promise<string | null> {
    const email = normalizeEmail(normalizedEmail);
    if (!email) return null;

    const matches = await client.customer.findMany({
      where: {
        organizationId,
        archivedAt: null,
        emailNormalized: email,
      },
      select: { id: true },
      take: 2,
    });

    if (matches.length === 1) return matches[0].id;
    return null;
  }

  private async customerBelongsToOrg(
    client: Tx,
    organizationId: string,
    customerId: string,
  ): Promise<boolean> {
    const row = await client.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true },
    });
    return Boolean(row);
  }

  private async vehicleBelongsToOrg(
    client: Tx,
    organizationId: string,
    vehicleId: string,
  ): Promise<boolean> {
    const row = await client.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    return Boolean(row);
  }

  private async stationBelongsToOrg(
    client: Tx,
    organizationId: string,
    stationId: string,
  ): Promise<boolean> {
    const row = await client.station.findFirst({
      where: { id: stationId, organizationId },
      select: { id: true },
    });
    return Boolean(row);
  }

  private async loadBookingInOrg(
    client: Tx,
    organizationId: string,
    bookingId: string,
  ): Promise<Pick<
    Booking,
    'id' | 'customerId' | 'vehicleId' | 'pickupStationId' | 'returnStationId' | 'actualPickupStationId' | 'actualReturnStationId' | 'status'
  > | null> {
    return client.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: {
        id: true,
        customerId: true,
        vehicleId: true,
        pickupStationId: true,
        returnStationId: true,
        actualPickupStationId: true,
        actualReturnStationId: true,
        status: true,
      },
    });
  }
}

export function resolveDeterministicBookingStation(
  booking: Pick<
    Booking,
    'pickupStationId' | 'returnStationId' | 'actualPickupStationId' | 'actualReturnStationId'
  >,
): string | null {
  const candidates = [
    booking.actualPickupStationId,
    booking.actualReturnStationId,
    booking.pickupStationId,
    booking.returnStationId,
  ].filter((id): id is string => Boolean(id));
  const unique = [...new Set(candidates)];
  if (unique.length === 1) return unique[0];
  return null;
}

export function conversationToResolverExisting(
  conversation: Pick<CommunicationConversation, CommunicationContextField>,
): ConversationContextPatch {
  return conversationToContextPatch(conversation);
}

export { isBookingEligibleForCommunicationResolution };
