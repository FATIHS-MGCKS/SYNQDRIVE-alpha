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
import {
  hasTrustworthyOccurredAt,
  isBookingSafeForCustomer,
  resolveConservativeCustomerIdentity,
} from './communication-identity-match.util';

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

    const customerId = await this.resolveCustomer(
      client,
      input,
      existing,
      native,
      hints,
      resolved,
      conflicts,
    );

    const safeBookingId = await this.resolveBooking(
      client,
      input,
      existing,
      native,
      customerId,
      resolved,
      conflicts,
    );

    await this.resolveVehicle(client, input, existing, native, safeBookingId, resolved, conflicts);
    await this.resolveStation(client, input, existing, native, safeBookingId, resolved, conflicts);
    await this.resolveUserAgent(client, input.organizationId, existing, native, resolved, conflicts);

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
        const phoneProbe = await this.matchCustomerByPhone(
          client,
          input.organizationId,
          hints.normalizedPhone,
        );
        if (
          phoneProbe.status === 'unique'
          && phoneProbe.customerId !== native.customerId
        ) {
          conflicts.push({
            field: 'customerId',
            code: 'NATIVE_PHONE_CONFLICT',
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

    const phoneMatch = await this.matchCustomerByPhone(
      client,
      input.organizationId,
      hints.normalizedPhone,
    );
    const emailMatch = await this.matchCustomerByEmail(
      client,
      input.organizationId,
      hints.normalizedEmail,
    );

    const identity = resolveConservativeCustomerIdentity(hints, phoneMatch, emailMatch);
    conflicts.push(...identity.conflicts);

    if (!identity.customerId || !identity.source) {
      return null;
    }

    this.setField(resolved, 'customerId', {
      value: identity.customerId,
      source:
        identity.source === 'EXACT_PHONE'
          ? CommunicationContextResolutionSource.EXACT_PHONE
          : CommunicationContextResolutionSource.EXACT_EMAIL,
    });
    return identity.customerId;
  }

  private async resolveBooking(
    client: Tx,
    input: CommunicationContextResolverInput,
    existing: ConversationContextPatch,
    native: NonNullable<CommunicationContextResolverInput['nativeContext']>,
    customerId: string | null,
    resolved: CommunicationContextResolutionByField,
    conflicts: CommunicationContextConflict[],
  ): Promise<string | null> {
    let safeBookingId: string | null = null;

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
        if (isBookingSafeForCustomer(booking.customerId, customerId)) {
          safeBookingId = existing.bookingId;
        } else if (customerId) {
          conflicts.push({
            field: 'bookingId',
            code: 'BOOKING_CUSTOMER_MISMATCH',
          });
        }
      }
    }

    if (native.bookingId) {
      const booking = await this.loadBookingInOrg(
        client,
        input.organizationId,
        native.bookingId,
      );
      if (booking) {
        if (isBookingSafeForCustomer(booking.customerId, customerId)) {
          this.setField(resolved, 'bookingId', {
            value: native.bookingId,
            source: CommunicationContextResolutionSource.NATIVE_RELATION,
          });
          safeBookingId = native.bookingId;
        } else {
          conflicts.push({
            field: 'bookingId',
            code: 'BOOKING_CUSTOMER_MISMATCH',
          });
        }
        return safeBookingId;
      }
      conflicts.push({
        field: 'bookingId',
        code: CommunicationContextAmbiguityReason.INVALID_NATIVE_REFERENCE,
      });
    }

    if (safeBookingId) {
      return safeBookingId;
    }

    if (!customerId || !hasTrustworthyOccurredAt(input.occurredAt)) {
      return null;
    }

    const timeWindowBookings = await client.booking.findMany({
      where: {
        organizationId: input.organizationId,
        customerId,
        status: { in: COMMUNICATION_ELIGIBLE_BOOKING_STATUSES },
        startDate: { lte: input.occurredAt },
        endDate: { gte: input.occurredAt },
      },
      select: { id: true, customerId: true },
      take: 3,
    });

    if (timeWindowBookings.length === 1) {
      this.setField(resolved, 'bookingId', {
        value: timeWindowBookings[0].id,
        source: CommunicationContextResolutionSource.BOOKING_TIME_WINDOW,
      });
      return timeWindowBookings[0].id;
    }

    if (timeWindowBookings.length > 1) {
      conflicts.push({
        field: 'bookingId',
        code: CommunicationContextAmbiguityReason.MULTIPLE_BOOKINGS,
      });
    }

    return null;
  }

  private async resolveVehicle(
    client: Tx,
    input: CommunicationContextResolverInput,
    existing: ConversationContextPatch,
    native: NonNullable<CommunicationContextResolverInput['nativeContext']>,
    safeBookingId: string | null,
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

    if (!safeBookingId) return;

    const booking = await this.loadBookingInOrg(client, input.organizationId, safeBookingId);
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
    safeBookingId: string | null,
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

    if (!safeBookingId) return;

    const booking = await this.loadBookingInOrg(client, input.organizationId, safeBookingId);
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

  private async resolveUserAgent(
    client: Tx,
    organizationId: string,
    existing: ConversationContextPatch,
    native: NonNullable<CommunicationContextResolverInput['nativeContext']>,
    resolved: CommunicationContextResolutionByField,
    conflicts: CommunicationContextConflict[],
  ): Promise<void> {
    if (existing.assignedUserId) {
      const valid = await this.assignedUserBelongsToOrg(
        client,
        organizationId,
        existing.assignedUserId,
      );
      if (valid) {
        resolved.assignedUserId = {
          value: existing.assignedUserId,
          source: CommunicationContextResolutionSource.EXISTING_CANONICAL,
        };
      }
    }

    if (native.assignedUserId) {
      const valid = await this.assignedUserBelongsToOrg(
        client,
        organizationId,
        native.assignedUserId,
      );
      if (valid) {
        this.setField(resolved, 'assignedUserId', {
          value: native.assignedUserId,
          source: CommunicationContextResolutionSource.NATIVE_RELATION,
        });
        if (existing.assignedUserId && existing.assignedUserId !== native.assignedUserId) {
          conflicts.push({ field: 'assignedUserId', code: 'ASSIGNMENT_CONFLICT' });
        }
      } else {
        conflicts.push({
          field: 'assignedUserId',
          code: CommunicationContextAmbiguityReason.CROSS_ORG_REFERENCE,
        });
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

  private async matchCustomerByPhone(
    client: Tx,
    organizationId: string,
    normalizedPhone?: string | null,
  ): Promise<{ status: 'none' | 'unique' | 'ambiguous'; customerId: string | null }> {
    const phone = normalizedPhone?.trim();
    if (!phone) return { status: 'none', customerId: null };

    const matches = await client.customer.findMany({
      where: {
        organizationId,
        archivedAt: null,
        phoneNormalized: phone,
      },
      select: { id: true },
      take: 2,
    });

    if (matches.length === 1) {
      return { status: 'unique', customerId: matches[0].id };
    }
    if (matches.length > 1) {
      return { status: 'ambiguous', customerId: null };
    }
    return { status: 'none', customerId: null };
  }

  private async matchCustomerByEmail(
    client: Tx,
    organizationId: string,
    normalizedEmail?: string | null,
  ): Promise<{ status: 'none' | 'unique' | 'ambiguous'; customerId: string | null }> {
    const email = normalizeEmail(normalizedEmail);
    if (!email) return { status: 'none', customerId: null };

    const matches = await client.customer.findMany({
      where: {
        organizationId,
        archivedAt: null,
        emailNormalized: email,
      },
      select: { id: true },
      take: 2,
    });

    if (matches.length === 1) {
      return { status: 'unique', customerId: matches[0].id };
    }
    if (matches.length > 1) {
      return { status: 'ambiguous', customerId: null };
    }
    return { status: 'none', customerId: null };
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

  private async assignedUserBelongsToOrg(
    client: Tx,
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    const membership = await client.organizationMembership.findFirst({
      where: { organizationId, userId },
      select: { id: true },
    });
    return Boolean(membership);
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
