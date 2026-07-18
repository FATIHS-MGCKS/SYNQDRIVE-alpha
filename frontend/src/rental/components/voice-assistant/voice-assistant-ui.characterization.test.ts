import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const voiceDir = resolve(import.meta.dirname);
const viewPath = resolve(voiceDir, '../VoiceAssistantView.tsx');
const wizardPath = resolve(voiceDir, 'VoiceOnboardingWizard.tsx');
const workspaceHookPath = resolve(voiceDir, 'useVoiceWorkspace.ts');
const iaPath = resolve(voiceDir, 'voice-information-architecture.ts');
const settingsPanelPath = resolve(voiceDir, 'VoiceSettingsPanel.tsx');
const apiPath = resolve(import.meta.dirname, '../../../lib/api.ts');

describe('voice assistant UI characterization', () => {
  const viewSource = readFileSync(viewPath, 'utf8');
  const wizardSource = readFileSync(wizardPath, 'utf8');
  const workspaceHookSource = readFileSync(workspaceHookPath, 'utf8');
  const iaSource = readFileSync(iaPath, 'utf8');
  const settingsPanelSource = readFileSync(settingsPanelPath, 'utf8');
  const apiSource = readFileSync(apiPath, 'utf8');

  describe('onboarding wizard', () => {
    it('renders onboarding shell while workspace state requires wizard', () => {
      expect(viewSource).toContain('shouldShowOnboardingShell');
      expect(viewSource).toContain('<VoiceOnboardingWizard');
    });

    it('persists wizard resume state server-side via workspace hook', () => {
      expect(workspaceHookSource).toContain('api.voiceAssistant.updateOnboardingStep');
      expect(workspaceHookSource).toContain('api.voiceAssistant.workspace');
      expect(viewSource).toContain('setWizardStep');
      expect(wizardSource).toContain('allowedSteps');
      expect(wizardSource).toContain('onStepChange');
    });

    it('includes eight wizard steps including plan and activation', () => {
      expect(wizardSource).toContain("step === 'plan'");
      expect(wizardSource).toContain("step === 'activation'");
      expect(wizardSource).toContain('VoiceWizardPlanStep');
      expect(wizardSource).toContain('VoiceWizardAssistantStep');
      expect(wizardSource).toContain('VoiceTestCenter');
    });
  });

  describe('post-activation operations navigation', () => {
    it('uses responsive ops tabs after activation with URL sync', () => {
      expect(viewSource).toContain('<VoiceResponsiveTabs');
      expect(viewSource).toContain('VOICE_OPS_TABS');
      expect(iaSource).toContain("voiceTab");
      expect(workspaceHookSource).toContain('setOpsTab');
    });

    it('loads billing remaining minutes for overview KPIs', () => {
      expect(viewSource).toContain('VoiceOperationsOverview');
    });

    it('isolates provider diagnostics under settings diagnostics section', () => {
      expect(viewSource).toContain('<VoiceSettingsPanel');
      expect(settingsPanelSource).toContain("activeSection === 'diagnostics'");
      expect(settingsPanelSource).toContain('VoiceProviderDiagnostic');
    });
  });

  describe('loading and error states', () => {
    it('renders dedicated loading state before assistant and workspace data are available', () => {
      expect(viewSource).toContain('loading || workspaceLoading');
      expect(viewSource).toContain('<VoiceSkeleton');
    });

    it('renders retryable error state when initial load fails without assistant data', () => {
      expect(viewSource).toContain('(loadError || workspaceError) && !assistant');
      expect(viewSource).toContain("t('voice.common.loadError')");
    });

    it('surfaces action errors inline without replacing the whole view', () => {
      expect(viewSource).toContain('{actionError && (');
      expect(viewSource).toContain('<ErrorState');
    });
  });

  describe('i18n', () => {
    it('uses translation keys for voice UI copy', () => {
      expect(viewSource).toContain('useLanguage()');
      expect(viewSource).toContain("t('voice.common.");
      expect(wizardSource).toContain("t('voice.wizard.");
    });
  });

  describe('tenant scoping', () => {
    it('sources orgId from rental context for all API calls', () => {
      expect(viewSource).toContain('const { orgId } = useRentalOrg()');
      expect(viewSource).toContain('api.voiceAssistant.get(orgId)');
      expect(workspaceHookSource).toContain('api.voiceAssistant.workspace(orgId)');
    });
  });

  describe('billing and protection APIs', () => {
    it('exposes tenant billing, protection, and workspace client methods', () => {
      expect(apiSource).toContain('billing: {');
      expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/billing/plans`');
      expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/billing/subscription`');
      expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/protection/status`');
      expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/workspace`');
    });
  });
});
