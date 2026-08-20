// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { VoiceAssistantData, VoiceAssistantReadiness } from '../../lib/api';
import { VoiceTelephonyWizard } from './voice-assistant/VoiceTelephonyWizard';
import { VoiceTestCenter } from './voice-assistant/VoiceTestCenter';
import {
  localizedVoiceTestScenarios,
  labelTestSessionPhase,
} from './voice-assistant/voice-assistant-i18n';
import { VOICE_TEST_SCENARIO_DEFINITIONS } from './voice-assistant/voice-test-scenarios';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P27B_ENFORCE_CLEAN_EXACT = [
  'rental/components/voice-assistant/VoiceTelephonyWizard.tsx',
  'rental/components/voice-assistant/VoiceTestCenter.tsx',
  'rental/components/voice-assistant/voice-test-scenarios.ts',
];

function isP27BEnforceCleanPath(relPath: string): boolean {
  return P27B_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p27bScopedFindings() {
  return inventory.findings.filter(finding => isP27BEnforceCleanPath(finding.file));
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(createElement(LanguageProvider, null, ui));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function buildAssistant(partial: Partial<VoiceAssistantData> = {}): VoiceAssistantData {
  return {
    id: 'asst-1',
    organizationId: 'org-1',
    name: 'Fleet Assistant',
    status: 'DRAFT',
    connectionStatus: 'CONNECTED',
    language: 'en',
    voiceId: 'voice-1',
    voiceName: 'Rachel',
    greetingMessage: 'Hello',
    systemPrompt: 'Be helpful',
    telephonyEnabled: false,
    inboundEnabled: false,
    outboundEnabled: false,
    phoneNumber: null,
    elevenLabsAgentId: 'agent-1234567890',
    totalCalls: 0,
    answeredCalls: 0,
    missedCalls: 0,
    escalatedCalls: 0,
    totalTalkMinutes: 0,
    toolPermissions: {},
    ...partial,
  } as VoiceAssistantData;
}

function buildReadiness(partial: Partial<VoiceAssistantReadiness> = {}): VoiceAssistantReadiness {
  return {
    ready: true,
    missing: [],
    checks: [{ key: 'elevenlabs', label: 'ElevenLabs', ok: true, required: true }],
    ...partial,
  };
}

const telephonyCallbacks = {
  loadPhoneNumbers: async () => [],
  assignPhoneNumber: async () => buildAssistant({ phoneNumber: '+49123456789' }),
  unassignPhoneNumber: async () => buildAssistant(),
  refreshTelephony: async () => ({
    assistant: buildAssistant(),
    phoneNumbers: [],
    telephonyStatus: {
      status: 'ready_for_inbound' as const,
      label: 'Connected',
      detail: 'ElevenLabs',
      providerConfigured: true,
      pstnProvider: 'elevenlabs' as const,
      agentProvisioned: true,
      phoneAssigned: false,
      inboundReady: false,
      outboundEnabled: false,
    },
  }),
  updateTelephonySettings: async () => buildAssistant(),
};

describe('rental voice assistant telephony + test center localization (P2.2.7B)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
  });

  describe('VoiceTelephonyWizard', () => {
    it('renders English wizard copy', () => {
      ({ cleanup } = renderWithLocale(
        'en',
        createElement(VoiceTelephonyWizard, {
          orgId: 'org-1',
          assistant: buildAssistant(),
          readinessElevenLabsOk: true,
          isBusy: false,
          onAssistantUpdated: () => {},
          onNavigateTest: () => {},
          onError: () => {},
          ...telephonyCallbacks,
        }),
      ));

      expect(document.body.textContent).toContain(en['voice.telephony.setup.title']);
      expect(document.body.textContent).toContain(en['voice.telephony.step.provider.title']);
      expect(document.body.textContent).toContain(en['voice.telephony.toggle.inbound.label']);
      expect(document.body.textContent).toContain(en['voice.telephony.openTestCenter']);
      expect(document.body.textContent).not.toContain('voice.telephony.setup.title');
    });

    it('renders German wizard copy', () => {
      ({ cleanup } = renderWithLocale(
        'de',
        createElement(VoiceTelephonyWizard, {
          orgId: 'org-1',
          assistant: buildAssistant(),
          readinessElevenLabsOk: true,
          isBusy: false,
          onAssistantUpdated: () => {},
          onNavigateTest: () => {},
          onError: () => {},
          ...telephonyCallbacks,
        }),
      ));

      expect(document.body.textContent).toContain(de['voice.telephony.setup.title']);
      expect(document.body.textContent).toContain(de['voice.telephony.step.inbound.title']);
      expect(document.body.textContent).toContain(de['voice.telephony.toggle.outbound.label']);
    });

    it('preserves machine payload keys in source', () => {
      const source = readFileSync(join(__dirname, 'voice-assistant/VoiceTelephonyWizard.tsx'), 'utf8');
      expect(source).toContain("'telephonyEnabled'");
      expect(source).toContain("'inboundEnabled'");
      expect(source).toContain("'outboundEnabled'");
      expect(source).toContain('phoneNumberId');
      expect(source).toContain('updateTelephonySettings({ outboundEnabled: true })');
    });

    it('gates outbound enable behind confirmation dialog', async () => {
      const updateTelephonySettings = vi.fn(async () => buildAssistant({ outboundEnabled: true }));

      ({ cleanup } = renderWithLocale(
        'en',
        createElement(VoiceTelephonyWizard, {
          orgId: 'org-1',
          assistant: buildAssistant({ outboundEnabled: false }),
          readinessElevenLabsOk: true,
          isBusy: false,
          onAssistantUpdated: () => {},
          onNavigateTest: () => {},
          onError: () => {},
          ...telephonyCallbacks,
          updateTelephonySettings,
        }),
      ));

      await act(async () => {
        await Promise.resolve();
      });

      const outboundCheckbox = [...document.querySelectorAll('input[type="checkbox"]')].find(input => {
        const label = input.closest('label');
        return label?.textContent?.includes(en['voice.telephony.toggle.outbound.label']);
      });
      expect(outboundCheckbox).toBeTruthy();

      await act(async () => {
        (outboundCheckbox as HTMLInputElement).click();
      });

      expect(document.body.textContent).toContain(en['voice.telephony.outbound.confirmTitle']);
      expect(document.body.textContent).toContain(en['common.cancel']);
      expect(updateTelephonySettings).not.toHaveBeenCalled();

      const confirmButton = [...document.querySelectorAll('button')].find(button =>
        button.textContent?.includes(en['voice.telephony.outbound.confirmAction']),
      );
      expect(confirmButton).toBeTruthy();

      await act(async () => {
        (confirmButton as HTMLButtonElement).click();
      });

      expect(updateTelephonySettings).toHaveBeenCalledWith({ outboundEnabled: true });
    });
  });

  describe('VoiceTestCenter', () => {
    it('renders English test center and localized scenario copy', () => {
      ({ cleanup } = renderWithLocale(
        'en',
        createElement(VoiceTestCenter, {
          orgId: 'org-1',
          assistant: buildAssistant(),
          readiness: buildReadiness(),
          onTestPassed: () => {},
          onNavigateTab: () => {},
        }),
      ));

      expect(document.body.textContent).toContain(en['voice.nav.tab.test']);
      expect(document.body.textContent).toContain(en['voice.test.scenarios.title']);
      expect(document.body.textContent).toContain(
        localizedVoiceTestScenarios('en', VOICE_TEST_SCENARIO_DEFINITIONS)[0].title,
      );
      expect(document.body.textContent).toContain(en['voice.test.startSession']);
      expect(document.body.textContent).not.toContain('voice.test.scenarios.title');
    });

    it('renders German test center and localized scenario copy', () => {
      ({ cleanup } = renderWithLocale(
        'de',
        createElement(VoiceTestCenter, {
          orgId: 'org-1',
          assistant: buildAssistant(),
          readiness: buildReadiness(),
          onTestPassed: () => {},
          onNavigateTab: () => {},
        }),
      ));

      expect(document.body.textContent).toContain(de['voice.nav.tab.test']);
      expect(document.body.textContent).toContain(de['voice.test.scenarios.title']);
      expect(document.body.textContent).toContain(
        localizedVoiceTestScenarios('de', VOICE_TEST_SCENARIO_DEFINITIONS)[0].title,
      );
      expect(document.body.textContent).toContain(labelTestSessionPhase('de', 'idle'));
    });

    it('keeps blocked session status as machine comparison in source', () => {
      const source = readFileSync(join(__dirname, 'voice-assistant/VoiceTestCenter.tsx'), 'utf8');
      expect(source).toContain("res.status === 'blocked'");
      expect(source).toContain("api.voiceAssistant.testSession(orgId)");
    });

    it('re-localizes the selected scenario when locale switches', async () => {
      const firstScenarioEn = localizedVoiceTestScenarios('en', VOICE_TEST_SCENARIO_DEFINITIONS)[0];
      const firstScenarioDe = localizedVoiceTestScenarios('de', VOICE_TEST_SCENARIO_DEFINITIONS)[0];

      function LocaleSwitchButton() {
        const { setLocale } = useLanguage();
        return createElement(
          'button',
          { type: 'button', 'data-testid': 'switch-locale-de', onClick: () => setLocale('de') },
          'DE',
        );
      }

      ({ cleanup } = renderWithLocale(
        'en',
        createElement(
          'div',
          null,
          createElement(LocaleSwitchButton),
          createElement(VoiceTestCenter, {
            orgId: 'org-1',
            assistant: buildAssistant(),
            readiness: buildReadiness(),
            onTestPassed: () => {},
            onNavigateTab: () => {},
          }),
        ),
      ));

      const scenarioButton = [...document.querySelectorAll('button')].find(button =>
        button.textContent?.includes(firstScenarioEn.title),
      );
      expect(scenarioButton).toBeTruthy();

      await act(async () => {
        (scenarioButton as HTMLButtonElement).click();
      });
      expect(document.body.textContent).toContain(firstScenarioEn.title);

      const switchButton = document.querySelector('[data-testid="switch-locale-de"]');
      expect(switchButton).toBeTruthy();

      await act(async () => {
        (switchButton as HTMLButtonElement).click();
      });

      expect(document.body.textContent).toContain(firstScenarioDe.title);
      expect(document.body.textContent).not.toContain(firstScenarioEn.title);
    });
  });

  describe('voice-test-scenarios definitions', () => {
    it('stores translation keys instead of raw operator copy', () => {
      const source = readFileSync(
        join(__dirname, 'voice-assistant/voice-test-scenarios.ts'),
        'utf8',
      );
      expect(source).toContain('titleKey:');
      expect(source).not.toContain('Customer wants to book a vehicle');
      expect(source).not.toContain('I would like to rent a car');
    });

    it('localizes all scenario definitions in EN and DE', () => {
      for (const definition of VOICE_TEST_SCENARIO_DEFINITIONS) {
        const enScenario = localizedVoiceTestScenarios('en', [definition])[0];
        const deScenario = localizedVoiceTestScenarios('de', [definition])[0];
        expect(enScenario.title).toBe(en[definition.titleKey]);
        expect(deScenario.title).toBe(de[definition.titleKey]);
        expect(enScenario.prompt).toBe(en[definition.promptKey]);
        expect(deScenario.prompt).toBe(de[definition.promptKey]);
      }
    });
  });

  describe('guardrails', () => {
    it('keeps P2.2.7B enforce-clean scope at zero findings', () => {
      expect(p27bScopedFindings()).toHaveLength(0);
    });

    it('does not add legacy ../i18n/ shim imports to P2.2.7B surfaces', () => {
      for (const relPath of P27B_ENFORCE_CLEAN_EXACT) {
        const source = readFileSync(join(__dirname, relPath.replace('rental/components/', '')), 'utf8');
        expect(source, relPath).not.toMatch(/from '\.\.\/i18n\//);
        if (relPath.endsWith('.tsx')) {
          expect(source, relPath).toContain("from '../../../i18n/LanguageContext'");
        }
      }
    });
  });
});
