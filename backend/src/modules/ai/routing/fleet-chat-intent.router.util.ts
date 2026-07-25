import {
  normalizeVehiclePlate,
} from '@modules/document-extraction/vehicle-candidate-matching.util';
import {
  extractAiVehicleResolutionHints,
  sanitizeAiVehicleUserText,
} from '../vehicle-resolution/ai-vehicle-resolution.hints';
import type { AiVehicleResolutionRecord } from '../vehicle-resolution/ai-vehicle-resolution.types';
import type { AiVehicleResolutionResult } from '../vehicle-resolution/ai-vehicle-resolution.types';
import type { AiDomainToolName } from '../registry/ai-domain-tool-registry.types';
import {
  FLEET_CHAT_INTENT_LLM_FALLBACK_THRESHOLD,
  FLEET_CHAT_INTENT_MIN_CONFIDENCE,
} from './fleet-chat-intent.enums';
import {
  FLEET_CHAT_INTENT_TO_TOOL,
  isVehicleSpecificIntent,
  resolveRequiredTools,
  scoreFleetChatIntents,
} from './fleet-chat-intent.rules';
import { detectFleetChatLanguage } from './fleet-chat-language.detector';
import { scanFleetChatSecurity, stripToolNamesForIntentScoring } from './fleet-chat-security.detector';
import type {
  FleetChatAmbiguity,
  FleetChatBookingReference,
  FleetChatClarification,
  FleetChatIntentScore,
  FleetChatRouteResult,
  FleetChatVehicleReference,
  RouteFleetChatMessageInput,
  FleetChatLlmClassificationResult,
} from './fleet-chat-intent.types';
import type { FleetChatIntent } from './fleet-chat-intent.enums';

const BOOKING_NUMBER_PATTERN =
  /\b(?:buchung|booking)\s*(?:#|nr\.?|nummer|number)?\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-_/]{4,})\b/gi;

const BOOKING_UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function countDistinctPlateHints(
  message: string,
  fleet: readonly AiVehicleResolutionRecord[],
): number {
  const messageNorm = normalizeVehiclePlate(message) ?? '';
  if (!messageNorm) {
    return 0;
  }
  let count = 0;
  for (const vehicle of fleet) {
    const plateNorm = normalizeVehiclePlate(vehicle.licensePlate);
    if (plateNorm && plateNorm.length >= 4 && messageNorm.includes(plateNorm)) {
      count += 1;
    }
  }
  return count;
}

function extractBookingReferences(input: {
  readonly message: string;
  readonly bookingId?: string | null;
}): readonly FleetChatBookingReference[] {
  const refs: FleetChatBookingReference[] = [];

  if (input.bookingId?.trim()) {
    refs.push({
      bookingId: input.bookingId.trim().toLowerCase(),
      bookingNumber: null,
      source: 'context_parameter',
    });
  }

  const bookingNumbers = [...input.message.matchAll(BOOKING_NUMBER_PATTERN)].map(
    (match) => match[1]?.trim(),
  );
  for (const number of bookingNumbers) {
    if (number) {
      refs.push({
        bookingId: null,
        bookingNumber: number,
        source: 'message_hint',
      });
    }
  }

  const uuids = [...input.message.matchAll(BOOKING_UUID_PATTERN)].map((m) =>
    m[0].toLowerCase(),
  );
  for (const uuid of uuids) {
    refs.push({
      bookingId: uuid,
      bookingNumber: null,
      source: 'message_hint',
    });
  }

  return refs;
}

function buildVehicleReference(
  resolution: AiVehicleResolutionResult,
): FleetChatVehicleReference | null {
  if (!resolution.resolvedVehicleId) {
    return null;
  }
  return {
    vehicleId: resolution.resolvedVehicleId,
    displayName: resolution.displayName,
    licensePlate: resolution.licensePlate,
    matchType: resolution.matchType,
    confidence: resolution.confidence,
    source: 'hardened_resolver',
  };
}

function pickPrimaryIntent(
  scores: readonly FleetChatIntentScore[],
  hasCombinedVehicleIntents: boolean,
): FleetChatIntent {
  if (hasCombinedVehicleIntents) {
    return 'COMBINED_VEHICLE_STATUS';
  }
  if (scores.length === 0) {
    return 'UNSUPPORTED';
  }
  const top = scores[0];
  if (top.intent === 'UNSUPPORTED' && scores.length > 1) {
    return scores[1].intent;
  }
  return top.intent;
}

function mergeLlmClassification(
  deterministic: readonly FleetChatIntentScore[],
  llm: FleetChatLlmClassificationResult | null,
): readonly FleetChatIntentScore[] {
  if (!llm || llm.intents.length === 0) {
    return deterministic;
  }

  const merged = new Map<FleetChatIntent, FleetChatIntentScore>();
  for (const entry of deterministic) {
    merged.set(entry.intent, entry);
  }

  for (const intent of llm.intents) {
    if (intent === 'COMBINED_VEHICLE_STATUS' || intent === 'AMBIGUOUS') {
      continue;
    }
    const existing = merged.get(intent);
    const boostedScore = Math.min(1, (existing?.score ?? 0) + llm.confidence * 0.25);
    merged.set(intent, {
      intent,
      score: boostedScore,
      matchedTerms: [...(existing?.matchedTerms ?? []), 'llm_classification'],
    });
  }

  return [...merged.values()].sort((a, b) => b.score - a.score);
}

function buildClarification(input: {
  readonly primaryIntent: FleetChatIntent;
  readonly resolution: AiVehicleResolutionResult;
  readonly vehicleRequired: boolean;
  readonly language: 'de' | 'en' | 'unknown';
}): FleetChatClarification | null {
  if (input.resolution.ambiguity.isAmbiguous) {
    const plates = input.resolution.ambiguity.candidates
      .map((candidate) => candidate.licensePlate)
      .filter((plate): plate is string => Boolean(plate?.trim()));
    return {
      kind: 'vehicle_ambiguous',
      messageDe:
        'Mehrere Fahrzeuge passen zu Ihrer Anfrage. Bitte nennen Sie das Kennzeichen oder den eindeutigen Fahrzeugnamen.',
      messageEn:
        'Multiple vehicles match your request. Please specify the license plate or unique vehicle name.',
      candidatePlates: plates.length > 0 ? plates : undefined,
    };
  }

  if (
    input.vehicleRequired &&
    !input.resolution.resolvedVehicleId &&
    input.primaryIntent !== 'GENERAL_FLEET_QUESTION' &&
    input.primaryIntent !== 'SYNQDRIVE_KNOWLEDGE' &&
    input.primaryIntent !== 'UNSUPPORTED'
  ) {
    return {
      kind: 'vehicle_missing',
      messageDe: 'Bitte nennen Sie das Kennzeichen oder den eindeutigen Fahrzeugnamen.',
      messageEn: 'Please specify the license plate or unique vehicle name.',
    };
  }

  if (input.primaryIntent === 'AMBIGUOUS') {
    return {
      kind: 'intent_unclear',
      messageDe: 'Ich konnte die Anfrage nicht eindeutig zuordnen. Bitte präzisieren Sie Ihre Frage.',
      messageEn: 'I could not classify your request clearly. Please rephrase your question.',
    };
  }

  return null;
}

export function validateFleetChatLlmClassification(data: unknown): FleetChatLlmClassificationResult | null {
  if (data == null || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.intents)) {
    return null;
  }
  const intents = record.intents.filter(
    (entry): entry is FleetChatIntent => typeof entry === 'string',
  );
  const confidence =
    typeof record.confidence === 'number' && Number.isFinite(record.confidence)
      ? Math.max(0, Math.min(1, record.confidence))
      : 0;
  return { intents, confidence };
}

export function routeFleetChatMessage(
  input: RouteFleetChatMessageInput & {
    readonly fleet?: readonly AiVehicleResolutionRecord[];
    readonly llmClassification?: FleetChatLlmClassificationResult | null;
  },
): FleetChatRouteResult {
  const sanitizedMessage = sanitizeAiVehicleUserText(input.message);
  const language = detectFleetChatLanguage(sanitizedMessage);
  const fleet = input.fleet ?? [];
  const hints = extractAiVehicleResolutionHints({
    message: input.message,
    fleet,
    bookingId: input.bookingId,
  });

  const multiplePlateHints = countDistinctPlateHints(sanitizedMessage, fleet) > 1;
  const securityScan = scanFleetChatSecurity({
    message: sanitizedMessage,
    resolvedVehicleId: input.vehicleResolution.resolvedVehicleId,
    internalVehicleIdInText: hints.internalVehicleId ?? null,
    vehicleAmbiguous: input.vehicleResolution.ambiguity.isAmbiguous,
    multipleVehicleHints: multiplePlateHints,
  });

  const intentScoringMessage = stripToolNamesForIntentScoring(sanitizedMessage);

  let intentScores = scoreFleetChatIntents(intentScoringMessage);
  const topScore = intentScores[0]?.score ?? 0;

  if (
    input.llmClassification &&
    topScore < FLEET_CHAT_INTENT_LLM_FALLBACK_THRESHOLD
  ) {
    intentScores = mergeLlmClassification(intentScores, input.llmClassification);
  }

  const vehicleSpecificScores = intentScores.filter((entry) =>
    isVehicleSpecificIntent(entry.intent),
  );
  const hasCombinedVehicleIntents = vehicleSpecificScores.length >= 2;

  let detectedIntents: FleetChatIntent[] = vehicleSpecificScores.map((s) => s.intent);
  if (hasCombinedVehicleIntents) {
    detectedIntents = [...detectedIntents];
    if (!detectedIntents.includes('COMBINED_VEHICLE_STATUS')) {
      detectedIntents.push('COMBINED_VEHICLE_STATUS');
    }
  }

  const nonVehicleScores = intentScores.filter(
    (entry) => !isVehicleSpecificIntent(entry.intent) && entry.intent !== 'UNSUPPORTED',
  );
  for (const entry of nonVehicleScores) {
    if (!detectedIntents.includes(entry.intent)) {
      detectedIntents.push(entry.intent);
    }
  }

  let primaryIntent = pickPrimaryIntent(intentScores, hasCombinedVehicleIntents);

  const ambiguities: FleetChatAmbiguity[] = [];
  if (input.vehicleResolution.ambiguity.isAmbiguous) {
    ambiguities.push({
      kind: 'vehicle',
      reason: input.vehicleResolution.ambiguity.reason ?? 'multiple_vehicles_match',
    });
  }

  const vehicleRequired = detectedIntents.some(isVehicleSpecificIntent);
  if (vehicleRequired && !input.vehicleResolution.resolvedVehicleId) {
    if (input.vehicleResolution.ambiguity.isAmbiguous) {
      primaryIntent = 'AMBIGUOUS';
    } else if (primaryIntent !== 'UNSUPPORTED' && primaryIntent !== 'SYNQDRIVE_KNOWLEDGE') {
      primaryIntent = 'AMBIGUOUS';
      ambiguities.push({
        kind: 'intent',
        reason: 'vehicle_required_but_unresolved',
      });
    }
  }

  if (primaryIntent === 'UNSUPPORTED' && intentScores.length <= 1) {
    detectedIntents = ['UNSUPPORTED'];
  }

  if (securityScan.flags.includes('prompt_injection_attempt')) {
    ambiguities.push({
      kind: 'intent',
      reason: 'prompt_injection_ignored',
      details: securityScan.injectionLabels.join(','),
    });
  }

  const requiredTools: readonly AiDomainToolName[] = hasCombinedVehicleIntents
    ? resolveRequiredTools(vehicleSpecificScores.map((s) => s.intent))
  : resolveRequiredTools(detectedIntents);

  const vehicleReference = buildVehicleReference(input.vehicleResolution);
  const vehicleReferences = vehicleReference ? [vehicleReference] : [];

  const clarificationNeeded = buildClarification({
    primaryIntent,
    resolution: input.vehicleResolution,
    vehicleRequired,
    language,
  });

  const confidenceBase =
    intentScores.length > 0
      ? intentScores.reduce((sum, entry) => sum + entry.score, 0) / intentScores.length
      : 0;
  const vehicleBoost = input.vehicleResolution.resolvedVehicleId ? 0.15 : 0;
  const ambiguityPenalty = input.vehicleResolution.ambiguity.isAmbiguous ? 0.25 : 0;
  const injectionPenalty = securityScan.flags.includes('prompt_injection_attempt')
    ? 0.1
    : 0;
  const confidence = Math.max(
    0,
    Math.min(1, confidenceBase + vehicleBoost - ambiguityPenalty - injectionPenalty),
  );

  const bookingReferences = extractBookingReferences({
    message: sanitizedMessage,
    bookingId: input.bookingId,
  });

  return {
    detectedIntents,
    primaryIntent,
    vehicleReferences,
    bookingReferences,
    requiredTools,
    ambiguities,
    clarificationNeeded,
    confidence,
    language,
    securityFlags: securityScan.flags,
    vehicleResolution: input.vehicleResolution,
    intentScores,
    usedLlmClassification: Boolean(input.llmClassification),
    sanitizedMessage,
  };
}
