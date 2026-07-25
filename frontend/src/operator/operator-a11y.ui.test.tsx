import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperatorBookingSheetShell } from './bookings/operatorBookingSheetShell';
import { OperatorBottomNav } from './components/OperatorBottomNav';
import { OperatorConnectivityBanner } from './components/OperatorConnectivityBanner';
import { OPERATOR_MAIN_ID, OPERATOR_SKIP_LINK_ID } from './lib/operatorA11y';

vi.mock('./context/OperatorShellContext', () => ({
  useOperatorShell: () => ({
    activeTab: 'today',
    setActiveTab: vi.fn(),
  }),
}));

vi.mock('./hooks/useOperatorNetworkStatus', () => ({
  useOperatorNetworkStatus: () => ({ online: false }),
}));

describe('Operator a11y UI markup', () => {
  it('booking sheet shell exposes dialog semantics and labelled heading', () => {
    const html = renderToStaticMarkup(
      <OperatorBookingSheetShell title="Buchung stornieren" onClose={() => {}}>
        <p>Inhalt</p>
      </OperatorBookingSheetShell>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('<h2');
    expect(html).toContain('aria-label="Schließen"');
    expect(html).toContain('focus-visible:ring-2');
  });

  it('bottom nav uses landmark, labels, and current page state', () => {
    const html = renderToStaticMarkup(<OperatorBottomNav />);
    expect(html).toContain('aria-label="Operator navigation"');
    expect(html).toContain('aria-label="Heute"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('min-h-[52px]');
    expect(html).toContain('motion-reduce:transition-none');
  });

  it('connectivity banner announces offline status politely', () => {
    const html = renderToStaticMarkup(<OperatorConnectivityBanner />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('offline');
  });

  it('exports stable skip-link and main content ids', () => {
    expect(OPERATOR_SKIP_LINK_ID).toBe('operator-skip-link');
    expect(OPERATOR_MAIN_ID).toBe('operator-main-content');
  });
});
