// @vitest-environment happy-dom
import { vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageProvider, translateKey } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { VoiceAssistantData } from '../../lib/api';
import { VoiceLaunchChecklist } from './voice-assistant/VoiceLaunchChecklist';
import { VoicePermissionsMatrix } from './voice-assistant/VoicePermissionsMatrix';
import { VoiceSectionNav } from './voice-assistant/VoiceSectionNav';
import {
  labelOperatorStatus,
  labelProviderStatus,
  localizedLaunchChecklistItem,
  va,
} from './voice-assistant/voice-assistant-i18n';
import { buildLaunchChecklist } from './voice-assistant/voice-assistant.ops';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P27A_ENFORCE_CLEAN_EXACT = [
  'rental/components/VoiceAssistantView.tsx',
  'rental/components/voice-assistant/VoiceAssistantBuilder.tsx',
  'rental/components/voice-assistant/VoiceConversationsPanel.tsx',
  'rental/components/voice-assistant/VoiceAnalyticsView.tsx',
  'rental/components/voice-assistant/VoicePermissionsMatrix.tsx',
  'rental/components/voice-assistant/VoiceCommandHeader.tsx',
  'rental/components/voice-assistant/VoiceSelectorField.tsx',
  'rental/components/voice-assistant/VoiceLaunchChecklist.tsx',
  'rental/components/voice-assistant/VoiceOnboardingWizard.tsx',
  'rental/components/voice-assistant/VoiceSectionNav.tsx',
];

function isP27AEnforceCleanPath(relPath: string): boolean {
  return P27A_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p27aScopedFindings() {
  return inventory.findings.filter((finding) => isP27AEnforceCleanPath(finding.file));
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
    connectionStatus: 'NOT_CONFIGURED',
    language: 'en',
    voiceId: null,
    voiceName: null,
    greetingMessage: null,
    systemPrompt: null,
    telephonyEnabled: false,
    inboundEnabled: false,
    outboundEnabled: false,
    phoneNumber: null,
    elevenLabsAgentId: null,
    totalCalls: 0,
    answeredCalls: 0,
    missedCalls: 0,
    escalatedCalls: 0,
    totalTalkMinutes: 0,
    toolPermissions: {},
    ...partial,
  } as VoiceAssistantData;
}

describe('rental voice assistant localization (P2.2.7A)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
  });

  describe('voice-assistant i18n helpers', () => {
    it('resolves operator and provider status labels in EN and DE', () => {
      expect(labelOperatorStatus('en', 'draft')).toBe(en['voice.status.operator.draft']);
      expect(labelOperatorStatus('de', 'active')).toBe(de['voice.status.operator.active']);
      expect(labelProviderStatus('en', 'CONNECTED', true)).toBe(en['voice.status.provider.connected']);
      expect(labelProviderStatus('de', 'NOT_CONFIGURED', false)).toBe(
        de['voice.status.provider.notConfigured'],
      );
    });

    it('reuses cross-domain keys where pre-flight specified exact reuse', () => {
      expect(va('en', 'serviceCenter.history.dateFrom')).toBe(en['serviceCenter.history.dateFrom']);
      expect(va('de', 'iam.risk.low')).toBe(de['iam.risk.low']);
      expect(va('de', 'evaluations.availability.loading')).toBe(
        de['evaluations.availability.loading'],
      );
    });

    it('localizes launch checklist item copy by checklist id', () => {
      const [item] = buildLaunchChecklist(buildAssistant({ name: 'Fleet' }), null, false);
      const localized = localizedLaunchChecklistItem('de', item);
      expect(localized.label).toBe(de['voice.checklist.identity.label']);
      expect(localized.description).toBe(de['voice.checklist.identity.description']);
    });
  });

  describe('component rendering', () => {
    it('renders VoiceSectionNav aria label and group labels in German', () => {
      ({ cleanup } = renderWithLocale(
        'de',
        createElement(VoiceSectionNav, {
          activeTab: 'overview',
          onChange: () => {},
        }),
      ));

      const nav = document.querySelector('nav');
      expect(nav?.getAttribute('aria-label')).toBe(de['voice.ops.navLabel']);
      expect(document.body.textContent).toContain(de['voice.nav.group.setup']);
      expect(document.body.textContent).toContain(de['voice.nav.tab.config']);
    });

    it('renders VoiceLaunchChecklist title and required chip in English', () => {
      const items = buildLaunchChecklist(buildAssistant({ name: 'Fleet' }), null, false);
      ({ cleanup } = renderWithLocale(
        'en',
        createElement(VoiceLaunchChecklist, {
          items,
          onNavigate: () => {},
        }),
      ));

      expect(document.body.textContent).toContain(en['voice.launch.title']);
      expect(document.body.textContent).toContain(en['voice.launch.subtitle']);
      expect(document.body.textContent).toContain(en['voice.checklist.identity.label']);
    });

    it('renders VoicePermissionsMatrix intro and low-risk chip in German', () => {
      ({ cleanup } = renderWithLocale(
        'de',
        createElement(VoicePermissionsMatrix, {
          assistant: buildAssistant(),
          draft: {},
          saving: false,
          hasDraft: false,
          onModeChange: () => {},
          onSave: () => {},
        }),
      ));

      expect(document.body.textContent).toContain(de['voice.permissions.matrixTitle']);
      expect(document.body.textContent).toContain(de['voice.permissions.matrixIntroLead']);
      expect(document.body.textContent).toContain(de['iam.risk.low']);
    });
  });

  describe('guardrails', () => {
    it('keeps P2.2.7A enforce-clean scope at zero findings', () => {
      const debt = p27aScopedFindings().filter((finding) => finding.severity === 'enforce-clean');
      expect(debt).toHaveLength(0);
      expect(p27aScopedFindings()).toHaveLength(0);
    });

    it('does not add new ../i18n/ compatibility shim consumers in touched voice files', () => {
      const voiceAssistantShell = join(__dirname, 'VoiceAssistantView.tsx');
      const shellSource = readFileSync(voiceAssistantShell, 'utf8');
      expect(shellSource).not.toMatch(/from '\.\.\/i18n\//);
      expect(shellSource).toContain("from '../../i18n/LanguageContext'");

      const touched = [
        join(__dirname, 'voice-assistant/VoiceOperationsOverview.tsx'),
        join(__dirname, 'voice-assistant/VoiceOpsSectionNav.tsx'),
        join(__dirname, 'voice-assistant/VoicePermissionGroupsPanel.tsx'),
        join(__dirname, 'voice-assistant/VoiceUsageAnalyticsPanel.tsx'),
        join(__dirname, 'voice-assistant/VoiceWizardPlanStep.tsx'),
        join(__dirname, 'voice-assistant/VoiceWizardKnowledgeStep.tsx'),
        join(__dirname, 'voice-assistant/VoiceOnboardingWizard.tsx'),
      ];
      for (const filePath of touched) {
        const source = readFileSync(filePath, 'utf8');
        expect(source, filePath).not.toMatch(/from '\.\.\/i18n\//);
        expect(source, filePath).not.toMatch(/from '\.\.\/\.\.\/i18n\//);
        expect(source, filePath).toContain("from '../../../i18n/LanguageContext'");
      }
    });

    it('keeps EN and DE dictionaries aligned for voice-assistant fragment keys', () => {
      const voiceKeys = Object.keys(en).filter((key) =>
        key.startsWith('voice.header.') ||
        key.startsWith('voice.builder.') ||
        key.startsWith('voice.conversations.') ||
        key.startsWith('voice.analytics.') ||
        key.startsWith('voice.permissions.matrix') ||
        key.startsWith('voice.permissions.suggestOnly') ||
        key.startsWith('voice.permissions.autonomous') ||
        key.startsWith('voice.permissions.enableAutonomous') ||
        key.startsWith('voice.permissions.confirmAutonomous') ||
        key.startsWith('voice.permissions.save') ||
        key.startsWith('voice.permissions.outboundDisabled') ||
        key.startsWith('voice.selector.') ||
        key.startsWith('voice.launch.') ||
        key.startsWith('voice.availability.timezoneExample') ||
        key.startsWith('voice.nav.') ||
        key.startsWith('voice.status.') ||
        key.startsWith('voice.checklist.'),
      );
      const deKeys = new Set(Object.keys(de));
      expect(voiceKeys.length).toBeGreaterThan(0);
      for (const key of voiceKeys) {
        expect(deKeys.has(key), key).toBe(true);
      }
    });

    it('falls back partial locales to English for voice assistant copy', () => {
      const result = translateKey('pl', 'voice.launch.title');
      expect(result.source).toBe('fallback-en');
      expect(result.text).toBe(en['voice.launch.title']);
    });
  });
});
