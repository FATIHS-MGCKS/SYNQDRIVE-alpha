import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LegalDocumentDto } from '../../lib/api';
import { LegalDocumentLifecycleImpactPanel } from '../components/legal-documents/lifecycle/LegalDocumentLifecycleImpactPanel';

const baseDoc: LegalDocumentDto = {
  id: 'doc-1',
  documentType: 'TERMS_AND_CONDITIONS',
  title: 'AGB',
  versionLabel: '2026-07',
  language: 'de',
  jurisdiction: 'DE',
  customerSegment: 'BOTH',
  channelScope: 'ALL',
  status: 'APPROVED',
  fileName: 'agb.pdf',
  sizeBytes: 1000,
  activeFrom: null,
  createdAt: '2026-07-01',
};

describe('LegalDocumentLifecycleImpactPanel', () => {
  it('renders activation impact including booking effects', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentLifecycleImpactPanel
        action="activate_now"
        document={baseDoc}
        activePeer={null}
        fourEyesEnabled={false}
        fourEyesBlocked={false}
      />,
    );
    expect(html).toContain('data-testid="legal-lifecycle-impact-panel"');
    expect(html).toContain('Bestehende Buchungen');
    expect(html).toContain('Neue Buchungen');
    expect(html).toContain('v2026-07');
  });

  it('distinguishes revoke from replace messaging', () => {
    const revokeHtml = renderToStaticMarkup(
      <LegalDocumentLifecycleImpactPanel
        action="revoke"
        document={{ ...baseDoc, status: 'ACTIVE' }}
        activePeer={null}
        fourEyesEnabled={false}
        fourEyesBlocked={false}
      />,
    );
    expect(revokeHtml).toContain('Widerruf ist rechtlich anders');

    const replaceHtml = renderToStaticMarkup(
      <LegalDocumentLifecycleImpactPanel
        action="replace_active"
        document={baseDoc}
        activePeer={{ ...baseDoc, id: 'active-1', status: 'ACTIVE', versionLabel: '2026-01' }}
        fourEyesEnabled={false}
        fourEyesBlocked={false}
      />,
    );
    expect(replaceHtml).toContain('Ersetzt');
    expect(replaceHtml).not.toContain('Widerruf ist rechtlich anders');
  });

  it('shows four-eyes warning when blocked', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentLifecycleImpactPanel
        action="approve"
        document={baseDoc}
        activePeer={null}
        fourEyesEnabled
        fourEyesBlocked
      />,
    );
    expect(html).toContain('data-testid="legal-lifecycle-four-eyes"');
    expect(html).toContain('gesperrt');
  });

  it('clarifies archive is not deletion', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentLifecycleImpactPanel
        action="archive"
        document={{ ...baseDoc, status: 'DRAFT' }}
        activePeer={null}
        fourEyesEnabled={false}
        fourEyesBlocked={false}
      />,
    );
    expect(html).toContain('keine Löschung');
  });
});
