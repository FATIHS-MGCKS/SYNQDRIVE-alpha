import type { CommunicationChannel } from '@prisma/client';
import type { ConversationContextPatch } from '../normalization/communication-normalization.types';

export const COMMUNICATION_CONTEXT_FIELDS = [
  'customerId',
  'bookingId',
  'vehicleId',
  'stationId',
  'assignedUserId',
  'assignedAgentRef',
  'assignedAgentType',
] as const satisfies ReadonlyArray<keyof ConversationContextPatch>;

export type CommunicationContextField = (typeof COMMUNICATION_CONTEXT_FIELDS)[number];

/** Deterministic resolution provenance — no probabilistic scores. */
export enum CommunicationContextResolutionSource {
  NATIVE_RELATION = 'NATIVE_RELATION',
  EXISTING_CANONICAL = 'EXISTING_CANONICAL',
  EXACT_PHONE = 'EXACT_PHONE',
  EXACT_EMAIL = 'EXACT_EMAIL',
  BOOKING_RELATION = 'BOOKING_RELATION',
  BOOKING_TIME_WINDOW = 'BOOKING_TIME_WINDOW',
}

export enum CommunicationContextAmbiguityReason {
  NO_MATCH = 'NO_MATCH',
  MULTIPLE_CUSTOMERS = 'MULTIPLE_CUSTOMERS',
  CONFLICTING_IDENTITIES = 'CONFLICTING_IDENTITIES',
  MULTIPLE_BOOKINGS = 'MULTIPLE_BOOKINGS',
  BOOKING_CONTEXT_UNCLEAR = 'BOOKING_CONTEXT_UNCLEAR',
  CROSS_ORG_REFERENCE = 'CROSS_ORG_REFERENCE',
  INVALID_NATIVE_REFERENCE = 'INVALID_NATIVE_REFERENCE',
}

export interface NativeCommunicationContext {
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  stationId?: string | null;
  assignedUserId?: string | null;
  assignedAgentRef?: string | null;
  assignedAgentType?: string | null;
}

export interface CommunicationIdentityHints {
  normalizedPhone?: string | null;
  normalizedEmail?: string | null;
}

export interface CommunicationContextResolverInput {
  organizationId: string;
  conversationId: string;
  channel: CommunicationChannel;
  occurredAt?: Date;
  nativeContext?: NativeCommunicationContext;
  identityHints?: CommunicationIdentityHints;
  existingCanonical?: ConversationContextPatch;
}

export interface ResolvedContextField {
  value: string | null;
  source: CommunicationContextResolutionSource;
  ambiguityReason?: CommunicationContextAmbiguityReason;
}

export type CommunicationContextResolutionByField = Partial<
  Record<CommunicationContextField, ResolvedContextField>
>;

export interface CommunicationContextConflict {
  field: CommunicationContextField;
  code: string;
}

export interface CommunicationContextResolutionResult {
  resolved: CommunicationContextResolutionByField;
  patch: ConversationContextPatch;
  conflicts: CommunicationContextConflict[];
}

export interface CommunicationContextBackfillResult {
  scanned: number;
  alreadyResolved: number;
  customerResolved: number;
  bookingResolved: number;
  vehicleResolved: number;
  stationResolved: number;
  ambiguous: number;
  conflicted: number;
  unresolved: number;
  applied: number;
}
