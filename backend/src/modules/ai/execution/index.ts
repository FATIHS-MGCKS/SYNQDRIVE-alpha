export {
  AI_DATA_ACCESS_PURPOSES,
  AI_EXECUTION_ACCESS_KINDS,
  AI_EXECUTION_CHANNELS,
  AI_VEHICLE_SCOPE_MODES,
} from './ai-execution-context.enums';
export type {
  AiDataAccessPurpose,
  AiExecutionAccessKind,
  AiExecutionChannel,
  AiVehicleScopeMode,
} from './ai-execution-context.enums';
export type {
  AiAllowedVehicleScope,
  AiDataAuthorizationProbe,
  AiExecutionAccessAuditPayload,
  AiExecutionContext,
  AiExecutionContextValidationIssue,
  AiExecutionContextValidationResult,
  AiVehicleOrgBinding,
  AiVehicleScopeResolver,
  VerifiedAiExecutionContextInput,
} from './ai-execution-context.types';
export {
  aiExecutionContextLogFields,
  buildAiExecutionContext,
  generateAiCorrelationId,
  isValidAiExecutionUuid,
  membershipPermissionsForContext,
  resolveAiRequestId,
} from './ai-execution-context.builder';
export {
  assertAiBookingAccess,
  assertAiCustomerDataAccess,
  assertAiFleetSummaryAccess,
  assertAiHealthAccess,
  assertAiLocationAccess,
  assertAiToolExecutionAllowed,
  resolveAiVehicleAccess,
} from './ai-execution-context.access';
export type {
  AiVehicleAccessInput,
  AiVehicleAccessResult,
} from './ai-execution-context.access';
export {
  assertAiExecutionContextPresent,
  assertValidAiExecutionContext,
  resolveAiExecutionContextError,
  validateAiExecutionContext,
} from './ai-execution-context.validation';
