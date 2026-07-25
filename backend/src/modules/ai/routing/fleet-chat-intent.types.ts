import type { AiDomainToolName } from '../registry/ai-domain-tool-registry.types';
import type { AiVehicleResolutionResult } from '../vehicle-resolution/ai-vehicle-resolution.types';
import type {
  FleetChatClarificationKind,
  FleetChatIntent,
  FleetChatRouteLanguage,
  FleetChatSecurityFlag,
} from './fleet-chat-intent.enums';

export interface FleetChatIntentScore {
  readonly intent: FleetChatIntent;
  readonly score: number;
  readonly matchedTerms: readonly string[];
}

export interface FleetChatVehicleReference {
  /** Only set when hardened resolver confirms org-bound match. */
  readonly vehicleId: string | null;
  readonly displayName: string | null;
  readonly licensePlate: string | null;
  readonly matchType: string;
  readonly confidence: number;
  readonly source: 'hardened_resolver';
}

export interface FleetChatBookingReference {
  readonly bookingId: string | null;
  readonly bookingNumber: string | null;
  readonly source: 'message_hint' | 'context_parameter';
}

export interface FleetChatAmbiguity {
  readonly kind: 'vehicle' | 'intent' | 'booking';
  readonly reason: string;
  readonly details?: string;
}

export interface FleetChatClarification {
  readonly kind: FleetChatClarificationKind;
  readonly messageDe: string;
  readonly messageEn: string;
  readonly candidatePlates?: readonly string[];
}

export interface FleetChatRouteResult {
  readonly detectedIntents: readonly FleetChatIntent[];
  readonly primaryIntent: FleetChatIntent;
  readonly vehicleReferences: readonly FleetChatVehicleReference[];
  readonly bookingReferences: readonly FleetChatBookingReference[];
  readonly requiredTools: readonly AiDomainToolName[];
  readonly ambiguities: readonly FleetChatAmbiguity[];
  readonly clarificationNeeded: FleetChatClarification | null;
  readonly confidence: number;
  readonly language: FleetChatRouteLanguage;
  readonly securityFlags: readonly FleetChatSecurityFlag[];
  readonly vehicleResolution: AiVehicleResolutionResult;
  readonly intentScores: readonly FleetChatIntentScore[];
  readonly usedLlmClassification: boolean;
  readonly sanitizedMessage: string;
}

export interface RouteFleetChatMessageInput {
  readonly organizationId: string;
  readonly message: string;
  readonly vehicleResolution: AiVehicleResolutionResult;
  readonly bookingId?: string | null;
}

export interface FleetChatLlmClassificationResult {
  readonly intents: readonly FleetChatIntent[];
  readonly confidence: number;
}
