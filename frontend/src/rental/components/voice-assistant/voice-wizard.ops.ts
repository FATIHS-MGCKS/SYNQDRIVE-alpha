import type { VoiceAssistantData, VoiceAssistantReadiness, VoicePlanCode } from '../../../lib/api';

export const WIZARD_STEPS = [
  'plan',
  'assistant',
  'knowledge',
  'permissions',
  'phone',
  'availability',
  'tests',
  'activation',
] as const;

export type VoiceWizardStep = (typeof WIZARD_STEPS)[number];

export type VoiceOpsTab =
  | 'overview'
  | 'conversations'
  | 'automations'
  | 'analytics'
  | 'settings';

const WIZARD_STORAGE_PREFIX = 'synqdrive.voice-wizard';

export function wizardStorageKey(orgId: string): string {
  return `${WIZARD_STORAGE_PREFIX}.${orgId}`;
}

/**
 * @deprecated Server workspace persists onboarding step — localStorage is legacy fallback only.
 */
export function loadWizardStep(orgId: string | null): VoiceWizardStep {
  if (!orgId || typeof window === 'undefined') return 'plan';
  try {
    const raw = localStorage.getItem(wizardStorageKey(orgId));
    if (!raw) return 'plan';
    const parsed = JSON.parse(raw) as { step?: string };
    if (parsed.step && (WIZARD_STEPS as readonly string[]).includes(parsed.step)) {
      return parsed.step as VoiceWizardStep;
    }
  } catch {
    // ignore corrupt storage
  }
  return 'plan';
}

/** @deprecated Prefer `api.voiceAssistant.updateOnboardingStep`. */
export function saveWizardStep(orgId: string, step: VoiceWizardStep): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(wizardStorageKey(orgId), JSON.stringify({ step, updatedAt: Date.now() }));
  } catch {
    // ignore storage failures
  }
}

export function clearWizardProgress(orgId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(wizardStorageKey(orgId));
  } catch {
    // ignore
  }
}

export function wizardStepIndex(step: VoiceWizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

export function nextWizardStep(step: VoiceWizardStep): VoiceWizardStep | null {
  const idx = wizardStepIndex(step);
  return idx < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[idx + 1] : null;
}

export function prevWizardStep(step: VoiceWizardStep): VoiceWizardStep | null {
  const idx = wizardStepIndex(step);
  return idx > 0 ? WIZARD_STEPS[idx - 1] : null;
}

export function isWizardStepComplete(
  step: VoiceWizardStep,
  ctx: {
    planCode: VoicePlanCode | null;
    assistant: VoiceAssistantData;
    readiness: VoiceAssistantReadiness | null;
    testPassed: boolean;
    knowledgeReady: boolean;
  },
): boolean {
  switch (step) {
    case 'plan':
      return Boolean(ctx.planCode);
    case 'assistant':
      return Boolean(
        ctx.assistant.name?.trim() &&
          ctx.assistant.voiceId &&
          ctx.assistant.greetingMessage?.trim(),
      );
    case 'knowledge':
      return ctx.knowledgeReady;
    case 'permissions':
      return Boolean(ctx.assistant.toolPermissions);
    case 'phone':
      return Boolean(
        ctx.assistant.phoneNumber ||
          (!ctx.assistant.telephonyEnabled && !ctx.assistant.inboundEnabled),
      );
    case 'availability':
      return Boolean(
        ctx.assistant.businessHoursStart?.trim() &&
          ctx.assistant.businessHoursEnd?.trim() &&
          (ctx.assistant.fallbackMessage?.trim() || ctx.assistant.escalationPhone?.trim()),
      );
    case 'tests':
      return ctx.testPassed;
    case 'activation':
      return Boolean(ctx.readiness?.ready && ctx.assistant.status === 'ACTIVE');
    default:
      return false;
  }
}

export function shouldShowOnboardingWizard(assistant: VoiceAssistantData): boolean {
  return assistant.status !== 'ACTIVE';
}
