import { WhatsAppAiDecision, WhatsAppAiIntent } from '@prisma/client';
import type { WhatsAppSensitiveFlag } from './whatsapp-message-policy.service';

export type { WhatsAppAiIntent, WhatsAppAiDecision };

export const WHATSAPP_AI_TOOLS = [
  'getBookingSummary',
  'getPickupInstructions',
  'getReturnInstructions',
  'getMissingDocuments',
  'getPaymentDepositStatus',
  'getVehicleStatus',
  'getVehicleLocationSummary',
  'getVehicleWarningSummary',
  'getOpenDamages',
  'createHumanReviewTask',
] as const;

export type WhatsAppAiToolName = (typeof WHATSAPP_AI_TOOLS)[number];

export interface WhatsAppAiSourceContextIds {
  organizationId: string;
  conversationId: string;
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  stationId?: string | null;
  messageId?: string | null;
}

export interface WhatsAppAiToolResult {
  tool: WhatsAppAiToolName;
  ok: boolean;
  summary?: string;
  data?: Record<string, unknown>;
  stale?: boolean;
}

export interface WhatsAppAiContextSnapshot {
  organizationId: string;
  conversationId: string;
  customer: {
    id: string;
    displayName: string;
    phone: string | null;
  } | null;
  hasActiveBooking: boolean;
  booking: {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    pickupStationName: string | null;
    returnStationName: string | null;
    vehicleLabel: string | null;
  } | null;
  vehicle: {
    id: string;
    label: string;
    licensePlate: string | null;
  } | null;
  station: {
    id: string;
    name: string;
    handoverInstructions: string | null;
    returnInstructions: string | null;
    address: string | null;
  } | null;
  sourceContextIds: WhatsAppAiSourceContextIds;
}

export interface WhatsAppAiRouterInput {
  orgId: string;
  conversationId: string;
  messageContent: string;
  triggerMessageId?: string | null;
}

export interface WhatsAppAiRouterResult {
  suggestedReply: string | null;
  intent: WhatsAppAiIntent;
  confidence: number;
  riskFlags: WhatsAppSensitiveFlag[];
  usedTools: WhatsAppAiToolName[];
  decision: WhatsAppAiDecision;
  humanReason: string | null;
  canSendAutomatically: boolean;
  suggestionId: string | null;
  reason: string | null;
  sourceContextIds: WhatsAppAiSourceContextIds;
}

export const AUTO_SIMPLE_SAFE_INTENTS: WhatsAppAiIntent[] = [
  WhatsAppAiIntent.GENERAL,
  WhatsAppAiIntent.BOOKING_STATUS,
  WhatsAppAiIntent.PICKUP_INFO,
  WhatsAppAiIntent.RETURN_INFO,
];

export const VEHICLE_DIMO_INTENTS: WhatsAppAiIntent[] = [
  WhatsAppAiIntent.VEHICLE_STATUS,
  WhatsAppAiIntent.VEHICLE_WARNING,
  WhatsAppAiIntent.LOCATION,
];
