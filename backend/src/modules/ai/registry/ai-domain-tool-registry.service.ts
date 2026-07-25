import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { MembershipRole } from '@prisma/client';
import { evaluateModulePermission } from '@shared/auth/permission.util';
import type { AiExecutionContext } from '../execution/ai-execution-context.types';
import { resolveAiExecutionContextError } from '../execution/ai-execution-context.validation';
import type { AiDomainError } from '../evidence/ai-domain-error.types';
import type { AiDomainQueryOutcome } from '../evidence/ai-domain-error.types';
import {
  buildAiDomainQueryOutcome,
  createInvalidInputError,
  createInternalProcessingFailedError,
  createPermissionDeniedError,
  createRoleRestrictedError,
  createTimeoutError,
} from '../evidence/ai-domain-error.factory';
import { toAiDomainQueryOutcomeForLlm } from '../evidence/ai-domain-error.factory';
import { AI_GET_VEHICLE_LOCATION_TOOL } from '../tools/get-vehicle-location/ai-get-vehicle-location.types';
import { AI_GET_VEHICLE_TELEMETRY_STATUS_TOOL } from '../tools/get-vehicle-telemetry-status/ai-get-vehicle-telemetry-status.types';
import { AI_GET_VEHICLE_HEALTH_SUMMARY_TOOL } from '../tools/get-vehicle-health-summary/ai-get-vehicle-health-summary.types';
import { AI_EXPLAIN_OVERDUE_RETURN_TOOL } from '../tools/explain-overdue-return/ai-explain-overdue-return.types';
import { AI_GET_VEHICLE_BOOKING_CONTEXT_TOOL } from '../tools/get-vehicle-booking-context/ai-get-vehicle-booking-context.types';
import { AiGetVehicleLocationTool } from '../tools/get-vehicle-location/ai-get-vehicle-location.tool';
import { AiGetVehicleTelemetryStatusTool } from '../tools/get-vehicle-telemetry-status/ai-get-vehicle-telemetry-status.tool';
import { AiGetVehicleHealthSummaryTool } from '../tools/get-vehicle-health-summary/ai-get-vehicle-health-summary.tool';
import { AiExplainOverdueReturnTool } from '../tools/explain-overdue-return/ai-explain-overdue-return.tool';
import { AiGetVehicleBookingContextTool } from '../tools/get-vehicle-booking-context/ai-get-vehicle-booking-context.tool';
import {
  AI_DOMAIN_TOOL_DEFINITION_BY_NAME,
  AI_DOMAIN_TOOL_DEFINITIONS,
  isAiDomainToolName,
} from './ai-domain-tool-registry.definitions';
import { validateAiDomainToolInput } from './ai-domain-tool-input.validation';
import {
  assertNoProviderDetailsInOutcome,
  buildAiDomainToolRegistryAuditPayload,
} from './ai-domain-tool-registry.audit';
import { AiRequestAuditService } from '../audit/ai-request-audit.service';
import { AiAgentToolCacheService } from '../limits/ai-agent-tool-cache.service';
import type {
  AiDomainToolDefinition,
  AiDomainToolExecuteOptions,
  AiDomainToolInvocationTracker,
  AiDomainToolName,
  AiDomainToolRegistryExecutor,
  AiDomainToolRegistryPreflightResult,
} from './ai-domain-tool-registry.types';

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Error,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(onTimeout());
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function blockedOutcome(
  tenantId: string,
  error: AiDomainError,
): AiDomainQueryOutcome<unknown> {
  return buildAiDomainQueryOutcome({
    tenantId,
    data: null,
    errors: [error],
    warnings: ['ai.domain_tool_registry:blocked'],
  });
}

/**
 * Central typed registry for SynqDrive AI domain tools.
 *
 * Only explicitly registered tools may be executed — no dynamic method dispatch.
 */
@Injectable()
export class AiDomainToolRegistry {
  private readonly executors: Readonly<Record<AiDomainToolName, AiDomainToolRegistryExecutor>>;

  constructor(
    private readonly getVehicleLocationTool: AiGetVehicleLocationTool,
    private readonly getVehicleTelemetryStatusTool: AiGetVehicleTelemetryStatusTool,
    private readonly getVehicleHealthSummaryTool: AiGetVehicleHealthSummaryTool,
    private readonly explainOverdueReturnTool: AiExplainOverdueReturnTool,
    private readonly getVehicleBookingContextTool: AiGetVehicleBookingContextTool,
    private readonly requestAudit: AiRequestAuditService,
    private readonly toolCache: AiAgentToolCacheService,
  ) {
    this.executors = {
      [AI_GET_VEHICLE_LOCATION_TOOL]: (context, input, nowMs) =>
        this.getVehicleLocationTool.execute(
          context,
          { vehicleId: String(input.vehicleId) },
          nowMs,
        ),
      [AI_GET_VEHICLE_TELEMETRY_STATUS_TOOL]: (context, input, nowMs) =>
        this.getVehicleTelemetryStatusTool.execute(
          context,
          { vehicleId: String(input.vehicleId) },
          nowMs,
        ),
      [AI_GET_VEHICLE_HEALTH_SUMMARY_TOOL]: (context, input, nowMs) =>
        this.getVehicleHealthSummaryTool.execute(
          context,
          { vehicleId: String(input.vehicleId) },
          nowMs,
        ),
      [AI_EXPLAIN_OVERDUE_RETURN_TOOL]: (context, input, nowMs) =>
        this.explainOverdueReturnTool.execute(
          context,
          {
            vehicleId: String(input.vehicleId),
            ...(input.bookingId != null ? { bookingId: String(input.bookingId) } : {}),
          },
          nowMs,
        ),
      [AI_GET_VEHICLE_BOOKING_CONTEXT_TOOL]: (context, input, nowMs) =>
        this.getVehicleBookingContextTool.execute(
          context,
          { vehicleId: String(input.vehicleId) },
          nowMs,
        ),
    };
  }

  listRegisteredTools(): readonly AiDomainToolDefinition[] {
    return AI_DOMAIN_TOOL_DEFINITIONS;
  }

  getDefinition(toolName: AiDomainToolName): AiDomainToolDefinition {
    return AI_DOMAIN_TOOL_DEFINITION_BY_NAME[toolName];
  }

  isRegisteredToolName(toolName: string): toolName is AiDomainToolName {
    return isAiDomainToolName(toolName);
  }

  preflight(
    context: AiExecutionContext | null | undefined,
    toolName: string,
    options?: Pick<AiDomainToolExecuteOptions, 'invocationTracker'>,
  ): AiDomainToolRegistryPreflightResult {
    const tenantId = context?.organizationId ?? 'unknown';

    if (!isAiDomainToolName(toolName)) {
      const error = createInvalidInputError({
        causeCode: 'AI_DOMAIN_TOOL_UNKNOWN',
        internalDetail: `unknown tool: ${toolName}`,
        organizationId: tenantId,
        correlationId: context?.correlationId,
      });
      return {
        allowed: false,
        toolName: null,
        definition: null,
        errors: [error],
      };
    }

    const definition = this.getDefinition(toolName);
    const errors = this.collectPreflightErrors(context, definition, options?.invocationTracker);

    return {
      allowed: errors.length === 0,
      toolName,
      definition,
      errors,
    };
  }

  async executeRegisteredTool(input: {
    readonly context: AiExecutionContext | null | undefined;
    readonly toolName: string;
    readonly rawInput: unknown;
    readonly options?: AiDomainToolExecuteOptions;
  }): Promise<AiDomainQueryOutcome<unknown>> {
    const tenantId = input.context?.organizationId ?? 'unknown';
    const nowMs = input.options?.nowMs ?? Date.now();

    if (!isAiDomainToolName(input.toolName)) {
      const error = createInvalidInputError({
        causeCode: 'AI_DOMAIN_TOOL_UNKNOWN',
        internalDetail: `unknown tool: ${input.toolName}`,
        organizationId: tenantId,
        correlationId: input.context?.correlationId,
      });
      this.emitAudit({
        event: 'ai.domain_tool.unknown_tool',
        toolName: 'get_vehicle_location',
        toolVersion: '1.0.0',
        decision: 'deny',
        context: input.context,
        code: error.code,
        internalDetail: error.diagnostics.internalDetail,
      });
      return blockedOutcome(tenantId, error);
    }

    const definition = this.getDefinition(input.toolName);
    const preflight = this.preflight(input.context, input.toolName, input.options);

    if (!preflight.allowed) {
      const primary = preflight.errors[0];
      this.emitAudit({
        event: 'ai.domain_tool.preflight_denied',
        toolName: definition.name,
        toolVersion: definition.version,
        decision: 'deny',
        context: input.context,
        code: primary?.code,
        internalDetail: primary?.diagnostics.internalDetail,
      });
      return blockedOutcome(tenantId, primary ?? preflight.errors[0]);
    }

    const inputValidation = validateAiDomainToolInput(
      definition.inputSchema,
      input.rawInput,
    );
    if (!inputValidation.valid || inputValidation.normalized == null) {
      const error = createInvalidInputError({
        causeCode: 'AI_DOMAIN_TOOL_INPUT_INVALID',
        internalDetail: inputValidation.issues
          .map((entry) => `${entry.path}: ${entry.message}`)
          .join('; '),
        organizationId: tenantId,
        correlationId: input.context?.correlationId,
      });
      return blockedOutcome(tenantId, error);
    }

    const verifiedContext = input.context as AiExecutionContext;
    const executor = this.executors[definition.name];
    const startedAt = Date.now();

    try {
      const normalized = inputValidation.normalized as Record<string, unknown>;
      const cacheKeySuffix = createHash('sha256')
        .update(JSON.stringify(normalized))
        .digest('hex')
        .slice(0, 16);

      const outcome = await this.toolCache.getOrExecute({
        context: verifiedContext,
        definition,
        cacheKeySuffix,
        execute: async () =>
          withTimeout(
            executor(verifiedContext, normalized, nowMs),
            input.options?.timeoutOverrideMs ?? definition.timeoutMs,
            () => new Error('AI_DOMAIN_TOOL_TIMEOUT'),
          ),
      });

      assertNoProviderDetailsInOutcome(outcome.data);

      this.recordInvocation(input.options?.invocationTracker, definition.name);

      this.emitAudit({
        event: 'ai.domain_tool.executed',
        toolName: definition.name,
        toolVersion: definition.version,
        decision: 'allow',
        context: verifiedContext,
        partial: outcome.partial,
        durationMs: Date.now() - startedAt,
      });

      return outcome;
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'AI_DOMAIN_TOOL_TIMEOUT') {
        const timeoutError = createTimeoutError({
          causeCode: 'AI_DOMAIN_TOOL_TIMEOUT',
          internalDetail: `${definition.name}: exceeded ${definition.timeoutMs}ms`,
          organizationId: tenantId,
          correlationId: verifiedContext.correlationId,
        });
        this.emitAudit({
          event: 'ai.domain_tool.timeout',
          toolName: definition.name,
          toolVersion: definition.version,
          decision: 'deny',
          context: verifiedContext,
          code: timeoutError.code,
          internalDetail: timeoutError.diagnostics.internalDetail,
          durationMs: Date.now() - startedAt,
        });
        return blockedOutcome(tenantId, timeoutError);
      }

      const internalError = createInternalProcessingFailedError({
        causeCode: 'AI_DOMAIN_TOOL_EXECUTION_FAILED',
        internalDetail: error instanceof Error ? error.message : String(error),
        organizationId: tenantId,
        correlationId: verifiedContext.correlationId,
      });
      return blockedOutcome(tenantId, internalError);
    }
  }

  /**
   * LLM-safe projection — strips diagnostics and provider details from errors.
   */
  toLlmOutcome(outcome: AiDomainQueryOutcome<unknown>) {
    return toAiDomainQueryOutcomeForLlm(outcome);
  }

  private collectPreflightErrors(
    context: AiExecutionContext | null | undefined,
    definition: AiDomainToolDefinition,
    tracker?: AiDomainToolInvocationTracker,
  ): readonly AiDomainError[] {
    const errors: AiDomainError[] = [];

    const contextError = resolveAiExecutionContextError(context);
    if (contextError) {
      errors.push(contextError);
      return errors;
    }

    const verifiedContext = context as AiExecutionContext;

    if (!this.isRoleAllowed(verifiedContext, definition)) {
      errors.push(
        createRoleRestrictedError({
          organizationId: verifiedContext.organizationId,
          correlationId: verifiedContext.correlationId,
          internalDetail: `ai.domain_tool_registry.role_denied:${definition.name}`,
        }),
      );
    }

    if (!definition.allowedChannels.includes(verifiedContext.channel)) {
      errors.push(
        createRoleRestrictedError({
          organizationId: verifiedContext.organizationId,
          correlationId: verifiedContext.correlationId,
          internalDetail: `ai.domain_tool_registry.channel_denied:${definition.name}:${verifiedContext.channel}`,
        }),
      );
    }

    for (const requirement of definition.requiredPermissions) {
      if (!this.hasPermission(verifiedContext, requirement.module, requirement.action)) {
        errors.push(
          createPermissionDeniedError({
            organizationId: verifiedContext.organizationId,
            correlationId: verifiedContext.correlationId,
            entityKind: requirement.module,
            internalDetail: `ai.domain_tool_registry.permission_denied:${definition.name}:${requirement.module}.${requirement.action}`,
          }),
        );
      }
    }

    if (definition.requiresSensitiveDataPermission) {
      const sensitiveGate = this.assertSensitiveToolPermission(verifiedContext, definition);
      if (sensitiveGate !== true) {
        errors.push(sensitiveGate);
      }
    }

    const invocationError = this.checkInvocationLimit(verifiedContext, definition, tracker);
    if (invocationError) {
      errors.push(invocationError);
    }

    return errors;
  }

  private isRoleAllowed(
    context: AiExecutionContext,
    definition: AiDomainToolDefinition,
  ): boolean {
    if (context.role === 'MASTER_ADMIN') {
      return true;
    }
    if (context.role === MembershipRole.DRIVER && definition.name === AI_GET_VEHICLE_HEALTH_SUMMARY_TOOL) {
      return false;
    }
    return (definition.allowedRoles as readonly string[]).includes(context.role);
  }

  private hasPermission(
    context: AiExecutionContext,
    module: string,
    action: 'read' | 'write',
  ): boolean {
    const membershipRole =
      context.role === 'MASTER_ADMIN' ? undefined : context.role;
    return evaluateModulePermission(context.permissions, module, action, {
      platformRole: context.platformRole,
      membershipRole,
    });
  }

  private assertSensitiveToolPermission(
    context: AiExecutionContext,
    definition: AiDomainToolDefinition,
  ): true | AiDomainError {
    if (definition.name === AI_GET_VEHICLE_LOCATION_TOOL) {
      if (!this.hasPermission(context, 'fleet', 'read')) {
        return createPermissionDeniedError({
          organizationId: context.organizationId,
          correlationId: context.correlationId,
          entityKind: 'location',
          internalDetail: 'ai.domain_tool_registry.sensitive_location_denied',
        });
      }
      return true;
    }

    if (definition.name === AI_GET_VEHICLE_BOOKING_CONTEXT_TOOL) {
      if (!this.hasPermission(context, 'bookings', 'read')) {
        return createPermissionDeniedError({
          organizationId: context.organizationId,
          correlationId: context.correlationId,
          entityKind: 'booking',
          internalDetail: 'ai.domain_tool_registry.sensitive_booking_denied',
        });
      }
      return true;
    }

    return true;
  }

  private checkInvocationLimit(
    context: AiExecutionContext,
    definition: AiDomainToolDefinition,
    tracker?: AiDomainToolInvocationTracker,
  ): AiDomainError | null {
    if (!tracker) {
      return null;
    }
    const current = tracker.counts.get(definition.name) ?? 0;
    if (current >= definition.maxInvocationsPerRequest) {
      return createInvalidInputError({
        causeCode: 'AI_DOMAIN_TOOL_INVOCATION_LIMIT',
        internalDetail: `${definition.name}: max ${definition.maxInvocationsPerRequest} per request`,
        organizationId: context.organizationId,
        correlationId: context.correlationId,
      });
    }
    return null;
  }

  private recordInvocation(
    tracker: AiDomainToolInvocationTracker | undefined,
    toolName: AiDomainToolName,
  ): void {
    if (!tracker) {
      return;
    }
    const current = tracker.counts.get(toolName) ?? 0;
    tracker.counts.set(toolName, current + 1);
  }

  private emitAudit(input: {
    event: import('./ai-domain-tool-registry.enums').AiDomainToolRegistryAuditEvent;
    toolName: AiDomainToolName;
    toolVersion: string;
    decision: 'allow' | 'deny';
    context: AiExecutionContext | null | undefined;
    code?: string;
    internalDetail?: string;
    partial?: boolean;
    durationMs?: number;
  }): void {
    if (!input.context) {
      return;
    }
    const payload = buildAiDomainToolRegistryAuditPayload({
      event: input.event,
      toolName: input.toolName,
      toolVersion: input.toolVersion,
      decision: input.decision,
      organizationId: input.context.organizationId,
      userId: input.context.userId,
      correlationId: input.context.correlationId,
      requestId: input.context.requestId,
      channel: input.context.channel,
      dataAccessPurpose: input.context.dataAccessPurpose,
      ...(input.code ? { code: input.code } : {}),
      ...(input.internalDetail ? { internalDetail: input.internalDetail } : {}),
      ...(input.partial != null ? { partial: input.partial } : {}),
      ...(input.durationMs != null ? { durationMs: input.durationMs } : {}),
    });
    this.requestAudit.recordToolEvent(payload, input.context.role);
  }
}
