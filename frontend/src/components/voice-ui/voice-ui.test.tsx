// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Phone } from 'lucide-react';

import {
  VoiceActionCard,
  VoiceEmptyState,
  VoiceHealthBanner,
  VoiceInlineNotice,
  VoiceMetricCard,
  VoicePageHeader,
  VoicePageShell,
  VoiceProviderDiagnostic,
  VoiceResponsiveTabs,
  VoiceSectionHeader,
  VoiceSkeleton,
  VoiceStatusHero,
  VoiceStepIndicator,
} from './index';
import {
  VOICE_UI_DIAGNOSTIC_ROWS,
  VOICE_UI_OPS_TABS,
  VOICE_UI_PRESENTATION_FIXTURES,
  VOICE_UI_WIZARD_STEPS,
} from './voice-ui.fixtures';

describe('Voice design system', () => {
  it('renders VoicePageShell with header and nav landmarks', () => {
    const html = renderToStaticMarkup(
      <VoicePageShell
        header={<VoicePageHeader title="Voice Assistant" eyebrow="Operations" />}
        nav={<nav data-testid="voice-nav">Tabs</nav>}
      >
        <p>Content</p>
      </VoicePageShell>,
    );
    expect(html).toContain('Voice Assistant');
    expect(html).toContain('Operations');
    expect(html).toContain('Content');
    expect(html).toContain('max-w-[1600px]');
  });

  it('renders VoiceStatusHero with accessible title and status chip', () => {
    const html = renderToStaticMarkup(
      <VoiceStatusHero
        title="Assistant online"
        description="Ready for inbound calls."
        statusLabel="Active"
        tone="success"
        icon={<Phone className="h-4 w-4" aria-hidden />}
      />,
    );
    expect(html).toContain('voice-status-hero-title');
    expect(html).toContain('Assistant online');
    expect(html).toContain('Active');
  });

  it('covers metric card loading and disabled presentation', () => {
    const loading = renderToStaticMarkup(
      <VoiceMetricCard label="Calls today" value="12" loading tone="info" />,
    );
    expect(loading).toContain('Calls today');

    const disabled = renderToStaticMarkup(
      <VoiceMetricCard label="Escalations" value="0" disabled tone="watch" />,
    );
    expect(disabled).toContain('pointer-events-none');
  });

  it('renders VoiceActionCard as button with focus ring classes', () => {
    const html = renderToStaticMarkup(
      <VoiceActionCard
        title="Run test call"
        description="Validate routing before launch."
        actionLabel="Open test center"
        onClick={() => {}}
      />,
    );
    expect(html).toContain('Run test call');
    expect(html).toContain('focus-visible:ring-2');
  });

  it('renders step indicator with current step semantics', () => {
    const html = renderToStaticMarkup(
      <VoiceStepIndicator steps={VOICE_UI_WIZARD_STEPS} currentIndex={1} layout="vertical" />,
    );
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('Assistant');
  });

  it('covers health banner alert and status roles across tones', () => {
    const blocked = renderToStaticMarkup(
      <VoiceHealthBanner
        title={VOICE_UI_PRESENTATION_FIXTURES.blocked.title}
        description={VOICE_UI_PRESENTATION_FIXTURES.blocked.description}
        tone="blocked"
      />,
    );
    expect(blocked).toContain('role="alert"');

    const success = renderToStaticMarkup(
      <VoiceHealthBanner
        title={VOICE_UI_PRESENTATION_FIXTURES.success.title}
        tone="success"
      />,
    );
    expect(success).toContain('role="status"');
  });

  it('renders empty, warning, and degraded inline notices', () => {
    const empty = renderToStaticMarkup(
      <VoiceEmptyState title="No calls" description="Start with a test call." />,
    );
    expect(empty).toContain('No calls');

    const warning = renderToStaticMarkup(
      <VoiceInlineNotice tone="warning" title="Budget watch">
        {VOICE_UI_PRESENTATION_FIXTURES.warning.description}
      </VoiceInlineNotice>,
    );
    expect(warning).toContain('role="alert"');

    const degraded = renderToStaticMarkup(
      <VoiceInlineNotice tone="degraded">
        {VOICE_UI_PRESENTATION_FIXTURES.degraded.description}
      </VoiceInlineNotice>,
    );
    expect(degraded).toContain('Some automations are paused');
  });

  it('renders provider diagnostic rows without hardcoded provider ids', () => {
    const html = renderToStaticMarkup(
      <VoiceProviderDiagnostic rows={VOICE_UI_DIAGNOSTIC_ROWS} title="Readiness checks" />,
    );
    expect(html).toContain('Telephony link');
    expect(html).toContain('Webhook intake');
    expect(html).not.toContain('elevenlabs');
    expect(html).not.toContain('twilio');
  });

  it('renders responsive tabs with disabled item and touch-friendly targets', () => {
    const html = renderToStaticMarkup(
      <VoiceResponsiveTabs
        items={VOICE_UI_OPS_TABS}
        activeKey="overview"
        onChange={() => {}}
        ariaLabel="Voice operations"
      />,
    );
    expect(html).toContain('aria-label="Voice operations"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('min-h-11');
    expect(html).toContain('Settings');
  });

  it('renders skeleton variants for loading state', () => {
    expect(renderToStaticMarkup(<VoiceSkeleton variant="hero" />)).toContain('aria-hidden');
    expect(renderToStaticMarkup(<VoiceSkeleton variant="metrics" />)).toContain('grid');
    expect(renderToStaticMarkup(<VoiceSkeleton variant="list" />)).toContain('space-y-2.5');
  });

  it('renders section header for subsection hierarchy', () => {
    const html = renderToStaticMarkup(
      <VoiceSectionHeader title="Usage" description="Current billing period" />,
    );
    expect(html).toContain('Usage');
    expect(html).toContain('Current billing period');
  });
});
