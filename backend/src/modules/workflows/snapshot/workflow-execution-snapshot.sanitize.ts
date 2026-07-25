import { APPROVAL_REQUIRED_ACTIONS } from '../workflow.constants';
import {
  WORKFLOW_ACTION_RISK_CLASSES,
  type WorkflowActionRiskClass,
} from './workflow-execution-snapshot.constants';

const SECRET_KEY_PATTERN =
  /(api[_-]?key|secret|token|password|authorization|bearer|private[_-]?key|webhook[_-]?secret|credential)/i;

const PII_KEY_PATTERN =
  /^(email|e[-_]?mail|phone|mobile|name|firstName|lastName|fullName|address|street|customerName|recipientEmail|recipientPhone)$/i;

const TEMPLATE_ID_KEYS = [
  'templateId',
  'template_id',
  'notificationTemplateId',
  'emailTemplateId',
  'smsTemplateId',
] as const;

const TEMPLATE_VERSION_KEYS = ['templateVersion', 'template_version', 'version'] as const;

export function stripSecretsFromValue(value: unknown, path = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => stripSecretsFromValue(item, `${path}[${index}]`));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (SECRET_KEY_PATTERN.test(key)) {
        output[key] = '[REDACTED]';
        continue;
      }
      output[key] = stripSecretsFromValue(child, childPath);
    }
    return output;
  }
  return value;
}

export function containsSecretKeys(value: unknown, path = ''): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = containsSecretKeys(value[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (SECRET_KEY_PATTERN.test(key) && child != null && child !== '') {
        return childPath;
      }
      const nested = containsSecretKeys(child, childPath);
      if (nested) return nested;
    }
  }
  return null;
}

export function minimizeEventPayload(
  raw: Record<string, unknown>,
  envelope: { entityType?: string | null; entityId?: string | null },
): {
  payloadRef: {
    kind: 'inline' | 'entity';
    entityType?: string | null;
    entityId?: string | null;
  };
  minimizedPayload: Record<string, unknown>;
} {
  const useEntityRef = Boolean(envelope.entityType && envelope.entityId);
  const sanitized = stripSecretsFromValue(raw) as Record<string, unknown>;
  const minimized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(sanitized)) {
    if (PII_KEY_PATTERN.test(key)) {
      if (useEntityRef) {
        minimized[key] = {
          ref: {
            entityType: envelope.entityType,
            entityId: envelope.entityId,
          },
        };
      } else if (typeof value === 'string' && value.length > 4) {
        minimized[key] = `[REDACTED:${value.length}]`;
      } else {
        minimized[key] = '[REDACTED]';
      }
      continue;
    }
    minimized[key] = value;
  }

  return {
    payloadRef: useEntityRef
      ? {
          kind: 'entity',
          entityType: envelope.entityType,
          entityId: envelope.entityId,
        }
      : { kind: 'inline' },
    minimizedPayload: minimized,
  };
}

export function extractTemplateRefs(
  config: Record<string, unknown>,
  purpose: string,
): Array<{ templateId: string; templateVersion: string; purpose: string }> {
  const refs: Array<{ templateId: string; templateVersion: string; purpose: string }> = [];
  const templateId = TEMPLATE_ID_KEYS.map((k) => config[k]).find((v) => typeof v === 'string');
  if (!templateId || typeof templateId !== 'string') {
    return refs;
  }
  const templateVersion =
    TEMPLATE_VERSION_KEYS.map((k) => config[k]).find((v) => typeof v === 'string') ?? 'unknown';
  refs.push({
    templateId,
    templateVersion: String(templateVersion),
    purpose,
  });
  return refs;
}

export function resolveActionRiskClass(actionType: string, requiresApproval: boolean): WorkflowActionRiskClass {
  if (requiresApproval || APPROVAL_REQUIRED_ACTIONS.has(actionType)) {
    return WORKFLOW_ACTION_RISK_CLASSES.HIGH;
  }
  if (
    actionType.includes('invoice') ||
    actionType.includes('charge') ||
    actionType.includes('customer.contact')
  ) {
    return WORKFLOW_ACTION_RISK_CLASSES.CRITICAL;
  }
  if (actionType.includes('notification') || actionType.includes('vehicle.status')) {
    return WORKFLOW_ACTION_RISK_CLASSES.MEDIUM;
  }
  return WORKFLOW_ACTION_RISK_CLASSES.LOW;
}

export function resolveRequiredPermissions(actionType: string, requiresApproval: boolean): string[] {
  const permissions = ['workflow:execute'];
  if (requiresApproval || APPROVAL_REQUIRED_ACTIONS.has(actionType)) {
    permissions.push('workflow:approve');
  }
  if (actionType.includes('notification')) {
    permissions.push('notification:send');
  }
  if (actionType.includes('vehicle.status')) {
    permissions.push('vehicle:write');
  }
  return [...new Set(permissions)];
}
