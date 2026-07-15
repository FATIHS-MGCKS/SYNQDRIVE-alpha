import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaskDetailActionBar } from './TaskDetailActionBar';

describe('TaskDetailActionBar', () => {
  it('renders desktop footer variant with primary and secondary actions', () => {
    const html = renderToStaticMarkup(
      <TaskDetailActionBar
        variant="desktop-footer"
        primary={{ kind: 'complete', label: 'Erledigen', enabled: true, emphasis: 'primary' }}
        secondaries={[
          { kind: 'moveToWaiting', label: 'Warten', enabled: true, emphasis: 'secondary' },
          { kind: 'comment', label: 'Kommentar', enabled: true, emphasis: 'secondary' },
        ]}
        overflow={[{ kind: 'cancel', label: 'Abbrechen', enabled: true, emphasis: 'overflow' }]}
        onAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="task-detail-action-bar-desktop"');
    expect(html).toContain('Erledigen');
    expect(html).toContain('Warten');
    expect(html).toContain('Kommentar');
    expect(html).toContain('Weitere Aktionen');
  });

  it('renders mobile sticky bar with safe-area and bottom-nav offset', () => {
    const html = renderToStaticMarkup(
      <TaskDetailActionBar
        variant="mobile-sticky"
        mobileBottomOffset="tab"
        primary={{ kind: 'start', label: 'Starten', enabled: true, emphasis: 'primary' }}
        secondaries={[]}
        overflow={[]}
        blockerSummary="Pflichtpunkt offen: Reifen prüfen"
        onAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="task-detail-action-bar-mobile"');
    expect(html).toContain('env(safe-area-inset-bottom)');
    expect(html).toContain('4.5rem');
    expect(html).toContain('Pflichtpunkt offen: Reifen prüfen');
  });

  it('uses sheet bottom offset without tab navigation padding', () => {
    const html = renderToStaticMarkup(
      <TaskDetailActionBar
        variant="mobile-sticky"
        mobileBottomOffset="sheet"
        primary={{ kind: 'resume', label: 'Fortsetzen', enabled: true, emphasis: 'primary' }}
        secondaries={[]}
        overflow={[]}
        onAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="task-detail-action-bar-mobile"');
    expect(html).not.toContain('4.5rem');
    expect(html).toContain('env(safe-area-inset-bottom)');
  });
});
