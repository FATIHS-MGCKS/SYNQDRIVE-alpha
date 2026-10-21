import {
  scanDimoProviderCallSites,
  summarizeDimoProviderCallSiteAudit,
} from './dimo-provider-call-site-audit.util';

describe('Dimo provider call-site audit (P1-001 architectural guard)', () => {
  it('has zero registered-vehicle provider paths missing canonical context', () => {
    const entries = scanDimoProviderCallSites();
    const summary = summarizeDimoProviderCallSiteAudit(entries);
    const bugs = entries.filter(
      (e) => e.classification === 'CONTEXT_UNAVAILABLE_BUT_REGISTERED_PATH',
    );

    if (bugs.length > 0) {
      const detail = bugs
        .map((b) => `${b.file}:${b.line} ${b.method} — ${b.reason}`)
        .join('\n');
      throw new Error(
        `Found ${bugs.length} provider call site(s) without canonical context:\n${detail}`,
      );
    }

    expect(summary.CONTEXT_UNAVAILABLE_BUT_REGISTERED_PATH).toBe(0);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('documents audited provider call volume by classification', () => {
    const summary = summarizeDimoProviderCallSiteAudit(scanDimoProviderCallSites());
    expect(summary.FULL_CONTEXT_REQUIRED).toBeGreaterThan(0);
    expect(
      summary.FULL_CONTEXT_REQUIRED +
        summary.TOKEN_ONLY_LEGITIMATE +
        summary.NOT_PROVIDER_BOUND,
    ).toBeGreaterThan(0);
  });
});
