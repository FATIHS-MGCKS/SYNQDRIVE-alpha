/**
 * Task Domain V2 — Manager override dialog (area 3)
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaskDetailChecklistOverrideDialog } from './TaskDetailChecklistOverrideDialog';

vi.mock('../../../components/patterns', () => ({
  ConfirmDialog: ({
    children,
    title,
    confirmLabel,
  }: {
    children: React.ReactNode;
    title: string;
    confirmLabel: string;
  }) => (
    <div data-testid="confirm-dialog">
      <h2>{title}</h2>
      <button type="button">{confirmLabel}</button>
      {children}
    </div>
  ),
}));

describe('TaskDetailChecklistOverrideDialog', () => {
  it('lists open required titles and requires a reason field', () => {
    const html = renderToStaticMarkup(
      <TaskDetailChecklistOverrideDialog
        open
        onOpenChange={vi.fn()}
        openRequiredTitles={['Kunde identifizieren', 'Fotos']}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain('Aufgabe trotz offener Pflichtpunkte abschließen?');
    expect(html).toContain('Offene Pflichtpunkte');
    expect(html).toContain('Kunde identifizieren');
    expect(html).toContain('Mit Begründung abschließen');
    expect(html).toContain('Begründung *');
    expect(html).toContain('Warum wird die Aufgabe ohne vollständige Checkliste abgeschlossen?');
  });
});
