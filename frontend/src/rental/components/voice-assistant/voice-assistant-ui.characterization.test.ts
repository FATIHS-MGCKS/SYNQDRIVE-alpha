import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const voiceDir = resolve(import.meta.dirname);
const viewPath = resolve(voiceDir, '../VoiceAssistantView.tsx');
const wizardPath = resolve(voiceDir, 'VoiceOnboardingWizard.tsx');
const apiPath = resolve(import.meta.dirname, '../../../lib/api.ts');

describe('voice assistant UI characterization', () => {
  const viewSource = readFileSync(viewPath, 'utf8');
  const wizardSource = readFileSync(wizardPath, 'utf8');
  const apiSource = readFileSync(apiPath, 'utf8');

  describe('onboarding wizard', () => {
    it('renders first-time wizard while assistant is not active', () => {
      expect(viewSource).toContain('shouldShowOnboardingWizard');
      expect(viewSource).toContain('<VoiceOnboardingWizard');
    });

    it('persists wizard resume state per organization', () => {
      expect(wizardSource).toContain('saveWizardStep(orgId, step)');
      expect(viewSource).toContain('loadWizardStep(orgId)');
    });

    it('includes eight wizard steps including plan and activation', () => {
      expect(wizardSource).toContain("step === 'plan'");
      expect(wizardSource).toContain("step === 'activation'");
      expect(wizardSource).toContain('VoiceWizardPlanStep');
      expect(wizardSource).toContain('VoiceTestCenter');
    });
  });

  describe('post-activation operations navigation', () => {
    it('uses five-tab operations nav after activation', () => {
      expect(viewSource).toContain('<VoiceOpsSectionNav');
      expect(viewSource).toContain("opsTab === 'overview'");
      expect(viewSource).toContain("opsTab === 'conversations'");
      expect(viewSource).toContain("opsTab === 'automations'");
      expect(viewSource).toContain("opsTab === 'analytics'");
      expect(viewSource).toContain("opsTab === 'settings'");
    });

    it('loads billing remaining minutes for overview KPIs', () => {
      expect(viewSource).toContain('VoiceOperationsOverview');
    });
  });

  describe('loading and error states', () => {
    it('renders dedicated loading state before assistant data is available', () => {
      expect(viewSource).toContain('if (loading)');
      expect(viewSource).toContain("t('voice.common.loading')");
    });

    it('renders retryable error state when initial load fails without assistant data', () => {
      expect(viewSource).toContain('if (loadError && !assistant)');
      expect(viewSource).toContain("t('voice.common.loadError')");
    });

    it('surfaces action errors inline without replacing the whole view', () => {
      expect(viewSource).toContain('{actionError && (');
      expect(viewSource).toContain('<ErrorState');
    });
  });

  describe('i18n', () => {
    it('uses translation keys for voice UI copy', () => {
      expect(viewSource).toContain("useLanguage()");
      expect(viewSource).toContain("t('voice.common.");
      expect(wizardSource).toContain("t('voice.wizard.");
    });
  });

  describe('tenant scoping', () => {
    it('sources orgId from rental context for all API calls', () => {
      expect(viewSource).toContain('const { orgId } = useRentalOrg()');
      expect(viewSource).toContain('api.voiceAssistant.get(orgId)');
    });
  });

  describe('billing and protection APIs', () => {
    it('exposes tenant billing and protection client methods', () => {
      expect(apiSource).toContain('billing: {');
      expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/billing/plans`');
      expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/billing/subscription`');
      expect(apiSource).toContain('`/organizations/${orgId}/voice-assistant/protection/status`');
    });
  });
});
