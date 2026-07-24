import {
  createInternalProcessingFailedError,
  createInvalidInputError,
} from '../evidence/ai-domain-error.factory';
import type { AiDomainError } from '../evidence/ai-domain-error.types';
import type {
  AiExecutionContext,
  AiExecutionContextValidationIssue,
  AiExecutionContextValidationResult,
} from './ai-execution-context.types';
import {
  AI_DATA_ACCESS_PURPOSES,
  AI_EXECUTION_CHANNELS,
} from './ai-execution-context.enums';
import { isValidAiExecutionUuid } from './ai-execution-context.builder';

function issue(path: string, message: string): AiExecutionContextValidationIssue {
  return { path, message };
}

export function validateAiExecutionContext(
  ctx: AiExecutionContext | null | undefined,
): AiExecutionContextValidationResult {
  const issues: AiExecutionContextValidationIssue[] = [];

  if (ctx == null) {
    return {
      valid: false,
      issues: [issue('context', 'AI execution context is required')],
    };
  }

  if (!ctx.organizationId || !isValidAiExecutionUuid(ctx.organizationId)) {
    issues.push(issue('organizationId', 'organizationId must be a valid UUID'));
  }
  if (!ctx.userId || !isValidAiExecutionUuid(ctx.userId)) {
    issues.push(issue('userId', 'userId must be a valid UUID'));
  }
  if (!ctx.correlationId) {
    issues.push(issue('correlationId', 'correlationId is required'));
  }
  if (!ctx.requestId) {
    issues.push(issue('requestId', 'requestId is required'));
  }
  if (!(AI_EXECUTION_CHANNELS as readonly string[]).includes(ctx.channel)) {
    issues.push(issue('channel', `invalid channel: ${ctx.channel}`));
  }
  if (!(AI_DATA_ACCESS_PURPOSES as readonly string[]).includes(ctx.dataAccessPurpose)) {
    issues.push(issue('dataAccessPurpose', `invalid purpose: ${ctx.dataAccessPurpose}`));
  }
  if (!ctx.role) {
    issues.push(issue('role', 'role is required'));
  }
  if (!ctx.allowedVehicleScope) {
    issues.push(issue('allowedVehicleScope', 'allowedVehicleScope is required'));
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Non-throwing guard for tool entrypoints — returns a domain error instead of throwing.
 */
export function resolveAiExecutionContextError(
  ctx: AiExecutionContext | null | undefined,
): AiDomainError | null {
  if (ctx == null) {
    return createInternalProcessingFailedError({
      causeCode: 'AI_EXECUTION_CONTEXT_MISSING',
      internalDetail: 'AI tool execution requires a verified execution context',
    });
  }

  const result = validateAiExecutionContext(ctx);
  if (!result.valid) {
    return createInvalidInputError({
      causeCode: 'AI_EXECUTION_CONTEXT_INVALID',
      internalDetail: result.issues
        .map((entry) => `${entry.path}: ${entry.message}`)
        .join('; '),
      organizationId: ctx.organizationId,
      correlationId: ctx.correlationId,
    });
  }

  return null;
}

export function assertValidAiExecutionContext(
  ctx: AiExecutionContext | null | undefined,
): asserts ctx is AiExecutionContext {
  const result = validateAiExecutionContext(ctx);
  if (!result.valid) {
    const summary = result.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
    throw new Error(`Invalid AI execution context: ${summary}`);
  }
}

export function assertAiExecutionContextPresent(
  ctx: AiExecutionContext | null | undefined,
): asserts ctx is AiExecutionContext {
  if (ctx == null) {
    throw new Error('AI_EXECUTION_CONTEXT_MISSING');
  }
  assertValidAiExecutionContext(ctx);
}
