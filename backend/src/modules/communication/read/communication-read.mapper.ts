import type { Prisma } from '@prisma/client';
import {
  CANONICAL_COMMUNICATION_METADATA_KEYS,
  type CanonicalCommunicationMetadata,
} from '../normalization/communication-metadata';
import type {
  CommunicationAssignedAgentRefDto,
  CommunicationAssignedUserRefDto,
  CommunicationBookingRefDto,
  CommunicationCustomerRefDto,
  CommunicationStationRefDto,
  CommunicationVehicleRefDto,
} from './dto/communication-read-shared.dto';
import type {
  CommunicationConversationDetailDto,
  CommunicationConversationListItemDto,
  CommunicationEventDto,
} from './dto/communication-read-response.dto';

export const UNKNOWN_CONTACT_DISPLAY_LABEL = 'Unbekannter Kontakt';

export const CONVERSATION_LIST_SELECT = {
  id: true,
  channel: true,
  status: true,
  lastActivityAt: true,
  unreadCount: true,
  createdAt: true,
  updatedAt: true,
  metadata: true,
  customerId: true,
  bookingId: true,
  vehicleId: true,
  stationId: true,
  assignedUserId: true,
  assignedAgentRef: true,
  assignedAgentType: true,
  customer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      company: true,
      archivedAt: true,
    },
  },
  booking: {
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
    },
  },
  vehicle: {
    select: {
      id: true,
      licensePlate: true,
      vehicleName: true,
      make: true,
      model: true,
    },
  },
  station: {
    select: {
      id: true,
      name: true,
    },
  },
  assignedUser: {
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
    },
  },
} satisfies Prisma.CommunicationConversationSelect;

export type CommunicationConversationListRow = Prisma.CommunicationConversationGetPayload<{
  select: typeof CONVERSATION_LIST_SELECT;
}>;

export const COMMUNICATION_EVENT_SELECT = {
  id: true,
  eventType: true,
  direction: true,
  actorType: true,
  occurredAt: true,
  providerIdentity: true,
  metadata: true,
} satisfies Prisma.CommunicationEventSelect;

export type CommunicationEventRow = Prisma.CommunicationEventGetPayload<{
  select: typeof COMMUNICATION_EVENT_SELECT;
}>;

export function bookingReference(bookingId: string): string {
  // Repo-wide generated technical reference — Booking has no separate public number column.
  return `BK-${bookingId.slice(-6).toUpperCase()}`;
}

export function communicationUserDisplayName(user: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
} | null | undefined): string | null {
  if (!user) return null;
  if (user.name?.trim()) return user.name.trim();
  const combined = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return combined || null;
}

export function mapCustomerRef(
  customer: CommunicationConversationListRow['customer'],
): CommunicationCustomerRefDto | null {
  if (!customer) return null;
  const company = customer.company?.trim();
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
  const displayName = company || name || null;
  if (!displayName) return null;
  return { id: customer.id, displayName };
}

export function mapBookingRef(
  booking: CommunicationConversationListRow['booking'],
): CommunicationBookingRefDto | null {
  if (!booking) return null;
  return {
    id: booking.id,
    reference: bookingReference(booking.id),
    status: booking.status,
    startDate: booking.startDate.toISOString(),
    endDate: booking.endDate.toISOString(),
  };
}

export function mapVehicleRef(
  vehicle: CommunicationConversationListRow['vehicle'],
): CommunicationVehicleRefDto | null {
  if (!vehicle) return null;
  const named = vehicle.vehicleName?.trim();
  const combined = [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim();
  const displayLabel = named || combined || vehicle.licensePlate?.trim() || null;
  if (!displayLabel) return null;
  return { id: vehicle.id, displayLabel };
}

export function mapStationRef(
  station: CommunicationConversationListRow['station'],
): CommunicationStationRefDto | null {
  if (!station) return null;
  return { id: station.id, name: station.name };
}

export function mapAssignedUserRef(
  user: CommunicationConversationListRow['assignedUser'],
): CommunicationAssignedUserRefDto | null {
  if (!user) return null;
  const displayName = communicationUserDisplayName(user);
  if (!displayName) return null;
  return { id: user.id, displayName };
}

export function mapAssignedAgentRef(
  assignedAgentRef: string | null,
  assignedAgentType: string | null,
): CommunicationAssignedAgentRefDto | null {
  if (!assignedAgentRef?.trim()) return null;
  return {
    ref: assignedAgentRef.trim(),
    type: assignedAgentType?.trim() || null,
  };
}

export function resolveConversationDisplayLabel(
  row: CommunicationConversationListRow,
): string {
  const customerName = mapCustomerRef(row.customer)?.displayName;
  if (customerName) return customerName;
  return UNKNOWN_CONTACT_DISPLAY_LABEL;
}

export function projectSafeReadMetadata(
  metadata: unknown,
): Record<string, string | number | boolean | null> | undefined {
  if (metadata === undefined || metadata === null) return undefined;
  if (typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;

  const input = metadata as Record<string, unknown>;
  const output: Record<string, string | number | boolean | null> = {};
  for (const key of CANONICAL_COMMUNICATION_METADATA_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    if (
      value === null
      || typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
    ) {
      output[key] = value;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

export function mapConversationListItem(
  row: CommunicationConversationListRow,
): CommunicationConversationListItemDto {
  const unreadCount = Math.max(0, row.unreadCount);
  return {
    id: row.id,
    channel: row.channel,
    status: row.status,
    unreadCount,
    lastActivityAt: row.lastActivityAt.toISOString(),
    displayLabel: resolveConversationDisplayLabel(row),
    customer: mapCustomerRef(row.customer),
    booking: mapBookingRef(row.booking),
    vehicle: mapVehicleRef(row.vehicle),
    station: mapStationRef(row.station),
    assignedUser: mapAssignedUserRef(row.assignedUser),
    assignedAgent: mapAssignedAgentRef(row.assignedAgentRef, row.assignedAgentType),
  };
}

export function mapConversationDetail(
  row: CommunicationConversationListRow,
): CommunicationConversationDetailDto {
  return {
    ...mapConversationListItem(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapCommunicationEvent(row: CommunicationEventRow): CommunicationEventDto {
  return {
    id: row.id,
    eventType: row.eventType,
    direction: row.direction,
    actorType: row.actorType,
    occurredAt: row.occurredAt.toISOString(),
    providerIdentity: row.providerIdentity,
    metadata: projectSafeReadMetadata(row.metadata),
  };
}

/** Test helper — recursive PII key denylist for public DTO snapshots. */
export function collectForbiddenPublicKeys(
  value: unknown,
  path = '',
  hits: string[] = [],
): string[] {
  const forbidden =
    /(?:^|\.)(phone|email|rawPayload|authorization|signature|providerResponse|transcript|body|text|content|token|secret)(?:\.|$)/i;
  if (value === null || value === undefined) return hits;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectForbiddenPublicKeys(entry, `${path}[${index}]`, hits));
    return hits;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (forbidden.test(key) || forbidden.test(nextPath)) {
        hits.push(nextPath);
      }
      collectForbiddenPublicKeys(nested, nextPath, hits);
    }
  }
  return hits;
}

export type { CanonicalCommunicationMetadata };
