import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const voiceDir = resolve(import.meta.dirname);
const viewPath = resolve(voiceDir, '../VoiceAssistantView.tsx');
const conversationsPath = resolve(voiceDir, 'VoiceConversationsPanel.tsx');
const testCenterPath = resolve(voiceDir, 'VoiceTestCenter.tsx');
const analyticsPath = resolve(voiceDir, 'VoiceAnalyticsView.tsx');

describe('voice assistant UI characterization', () => {
  const viewSource = readFileSync(viewPath, 'utf8');
  const conversationsSource = readFileSync(conversationsPath, 'utf8');
  const testCenterSource = readFileSync(testCenterPath, 'utf8');
  const analyticsSource = readFileSync(analyticsPath, 'utf8');

  describe('loading and error states', () => {
    it('renders dedicated loading state before assistant data is available', () => {
      expect(viewSource).toContain('if (loading)');
      expect(viewSource).toContain('Loading voice assistant...');
    });

    it('renders retryable error state when initial load fails without assistant data', () => {
      expect(viewSource).toContain('if (loadError && !assistant)');
      expect(viewSource).toContain('Could not load voice assistant');
      expect(viewSource).toContain('onClick={() => load()}');
    });

    it('surfaces action errors inline without replacing the whole view', () => {
      expect(viewSource).toContain('{actionError && (');
      expect(viewSource).toContain('<ErrorState');
      expect(viewSource).toContain('title="Action failed"');
    });

    it('handles missing organization context as a load error', () => {
      expect(viewSource).toContain("setLoadError('Organization context is missing.')");
    });
  });

  describe('readiness and activation gating', () => {
    it('derives activation eligibility from readiness or active status', () => {
      expect(viewSource).toContain('const canActivate = Boolean(readiness?.ready) || isActive');
      expect(viewSource).toContain('canActivate={canActivate}');
    });

    it('computes readiness percent and provider warnings for KPI strip', () => {
      expect(viewSource).toContain('readinessPercent(readiness)');
      expect(viewSource).toContain("readiness?.checks.find(c => c.key === 'elevenlabs')");
      expect(viewSource).toContain('providerWarning');
    });

    it('refreshes readiness after save and activation flows', () => {
      expect(viewSource).toContain('await refreshReadiness(orgId)');
    });
  });

  describe('tab switching and lazy data loading', () => {
    it('uses VoiceSectionNav for tab state', () => {
      expect(viewSource).toContain('<VoiceSectionNav activeTab={tab} onChange={setTab} />');
    });

    it('loads voices only on configuration tab', () => {
      expect(viewSource).toContain("if (tab === 'config') void loadVoices()");
    });

    it('loads conversations only on logs tab', () => {
      expect(viewSource).toContain("if (tab === 'logs') loadConversations()");
    });

    it('renders tab panels conditionally with orgId guard', () => {
      expect(viewSource).toContain("{tab === 'telephony' && orgId && (");
      expect(viewSource).toContain("{tab === 'test' && orgId && (");
      expect(viewSource).toContain("{tab === 'analytics' && orgId && (");
      expect(viewSource).toContain("{tab === 'logs' && orgId && (");
    });
  });

  describe('tenant scoping', () => {
    it('sources orgId from rental context for all API calls', () => {
      expect(viewSource).toContain('const { orgId } = useRentalOrg()');
      expect(viewSource).toContain('api.voiceAssistant.get(orgId)');
      expect(viewSource).toContain('api.voiceAssistant.update(orgId');
      expect(viewSource).toContain('api.voiceAssistant.conversations(orgId');
    });

    it('does not hardcode organization identifiers in the view', () => {
      expect(viewSource).not.toMatch(/organizations\/org-[a-z0-9-]+/i);
    });
  });

  describe('empty states in child panels', () => {
    it('uses EmptyState in conversations panel', () => {
      expect(conversationsSource).toContain('<EmptyState');
    });

    it('uses EmptyState in test center and analytics views', () => {
      expect(testCenterSource).toContain('<EmptyState');
      expect(analyticsSource).toContain('<EmptyState');
    });
  });

  describe('pending ADR targets', () => {
    it.todo('ADR target: hide voice assistant management UI from worker and driver roles');
  });
});
