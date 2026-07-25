export {
  AI_VEHICLE_AMBIGUITY_DELTA,
  AI_VEHICLE_MATCH_BASE_SCORE,
  AI_VEHICLE_MATCH_TYPES,
  AI_VEHICLE_MIN_CONFIDENCE,
} from './ai-vehicle-resolution.enums';
export type { AiVehicleMatchType } from './ai-vehicle-resolution.enums';
export type {
  AiVehicleAllowedDataScope,
  AiVehicleResolutionAmbiguity,
  AiVehicleResolutionCandidate,
  AiVehicleResolutionHints,
  AiVehicleResolutionRecord,
  AiVehicleResolutionResult,
  ResolveAiVehicleFromMessageInput,
  ScoredAiVehicleMatch,
} from './ai-vehicle-resolution.types';
export {
  buildAiVehicleDisplayName,
  extractAiVehicleResolutionHints,
  normalizePlate,
  sanitizeAiVehicleLlmField,
  sanitizeAiVehicleUserText,
} from './ai-vehicle-resolution.hints';
export {
  resolveAiVehicleFromMessage,
  toLlmSafeVehicleCandidate,
} from './ai-vehicle-resolution.matcher';
export {
  buildEnrichedChatMessage,
  FLEET_CHAT_SYSTEM_PROMPT,
  formatChatScopeLog,
  resolveChatVehicleTokenIds,
} from './ai-vehicle-resolution.llm';
export { AiVehicleResolutionService } from './ai-vehicle-resolution.service';
