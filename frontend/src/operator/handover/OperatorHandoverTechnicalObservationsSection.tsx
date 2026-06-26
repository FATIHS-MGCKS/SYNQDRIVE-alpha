import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  OBSERVATION_AREAS,
  OBSERVATION_CATEGORIES,
  OBSERVATION_SEVERITIES,
  observationAreaLabel,
  observationCategoryLabel,
  observationSeverityLabel,
  severityChipClass,
} from '../../rental/lib/technical-observations-ui';
import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';
import {
  createEmptyObservationDraft,
  OPERATOR_OBSERVATION_QUICK_CHIPS,
  type OperatorHandoverObservationDraft,
} from './operatorHandoverTechnicalObservations';
import { OperatorHandoverField, operatorTextareaClass } from './operatorHandoverUi';

interface Props {
  form: OperatorHandoverFormApi;
}

const EMPTY_EDITOR = createEmptyObservationDraft();

export function OperatorHandoverTechnicalObservationsSection({ form }: Props) {
  const [editor, setEditor] = useState<OperatorHandoverObservationDraft>(EMPTY_EDITOR);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<'category' | 'area' | null>(null);

  const drafts = form.state.technicalObservationDrafts;
  const chipPlaceholder = useMemo(() => {
    const chip = OPERATOR_OBSERVATION_QUICK_CHIPS.find((c) => c.category === editor.category);
    return chip?.placeholder ?? 'Was ist aufgefallen?';
  }, [editor.category]);

  const resetEditor = () => {
    setEditor(createEmptyObservationDraft());
    setEditorError(null);
    setActivePicker(null);
  };

  const applyQuickChip = (chip: (typeof OPERATOR_OBSERVATION_QUICK_CHIPS)[number]) => {
    setEditor((prev) => ({
      ...prev,
      category: chip.category,
      affectedArea: chip.affectedArea,
      description: prev.description.trim() ? prev.description : '',
    }));
    setEditorError(null);
  };

  const addDraft = () => {
    const description = editor.description.trim();
    if (description.length < 3) {
      setEditorError('Bitte mindestens 3 Zeichen beschreiben');
      return;
    }
    form.addTechnicalObservationDraft({
      ...editor,
      description,
      id: editor.id || createEmptyObservationDraft().id,
    });
    resetEditor();
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card/80 p-4">
      <div>
        <p className="text-sm font-semibold">Technische Beobachtungen</p>
        <p className="text-[11px] text-muted-foreground">
          Technische Auffälligkeiten — nicht jede Beobachtung ist ein Schaden.
        </p>
      </div>

      {drafts.length > 0 && (
        <ul className="space-y-2">
          {drafts.map((d) => (
            <li
              key={d.id}
              className="rounded-xl border border-border/60 bg-background/60 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{d.description}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {observationCategoryLabel(d.category)}
                    </span>
                    {d.affectedArea && (
                      <span className="text-[10px] text-muted-foreground">
                        {observationAreaLabel(d.affectedArea)}
                      </span>
                    )}
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${severityChipClass(d.severity)}`}
                    >
                      {observationSeverityLabel(d.severity)}
                    </span>
                    {d.blocksRental && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[color:var(--status-critical)]">
                        <AlertTriangle className="h-3 w-3" />
                        Blockiert Vermietung
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => form.removeTechnicalObservationDraft(d.id)}
                  className="sq-press flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 text-muted-foreground"
                  aria-label="Beobachtung entfernen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-xl border border-dashed border-border/70 bg-muted/20 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Schnellauswahl
        </p>
        <div className="flex flex-wrap gap-2">
          {OPERATOR_OBSERVATION_QUICK_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => applyQuickChip(chip)}
              className={`sq-press min-h-[40px] rounded-full border px-3 text-xs font-semibold ${
                editor.category === chip.category
                  ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                  : 'border-border bg-card text-foreground'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <OperatorHandoverField label="Beschreibung *">
          <textarea
            value={editor.description}
            onChange={(e) => {
              setEditor((prev) => ({ ...prev, description: e.target.value }));
              setEditorError(null);
            }}
            placeholder={chipPlaceholder}
            className={operatorTextareaClass}
          />
        </OperatorHandoverField>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActivePicker((p) => (p === 'category' ? null : 'category'))}
            className="sq-press min-h-[48px] rounded-xl border border-border bg-card px-3 text-left text-sm"
          >
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">
              Kategorie
            </span>
            <span className="font-medium">{observationCategoryLabel(editor.category)}</span>
          </button>
          <button
            type="button"
            onClick={() => setActivePicker((p) => (p === 'area' ? null : 'area'))}
            className="sq-press min-h-[48px] rounded-xl border border-border bg-card px-3 text-left text-sm"
          >
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">
              Bereich
            </span>
            <span className="font-medium">
              {editor.affectedArea ? observationAreaLabel(editor.affectedArea) : 'Optional'}
            </span>
          </button>
        </div>

        {activePicker === 'category' && (
          <div className="grid grid-cols-2 gap-2">
            {OBSERVATION_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  setEditor((prev) => ({ ...prev, category: c.value }));
                  setActivePicker(null);
                }}
                className={`sq-press min-h-[44px] rounded-lg border px-2 text-xs font-semibold ${
                  editor.category === c.value
                    ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]'
                    : 'border-border bg-card'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {activePicker === 'area' && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setEditor((prev) => ({ ...prev, affectedArea: undefined }));
                setActivePicker(null);
              }}
              className="sq-press min-h-[44px] rounded-lg border border-border bg-card px-2 text-xs font-semibold"
            >
              Kein Bereich
            </button>
            {OBSERVATION_AREAS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => {
                  setEditor((prev) => ({ ...prev, affectedArea: a.value }));
                  setActivePicker(null);
                }}
                className={`sq-press min-h-[44px] rounded-lg border px-2 text-xs font-semibold ${
                  editor.affectedArea === a.value
                    ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]'
                    : 'border-border bg-card'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Schweregrad
          </p>
          <div className="grid grid-cols-4 gap-2">
            {OBSERVATION_SEVERITIES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setEditor((prev) => ({ ...prev, severity: s.value }))}
                className={`sq-press min-h-[44px] rounded-lg border text-xs font-semibold ${
                  editor.severity === s.value
                    ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]'
                    : 'border-border bg-card'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setEditor((prev) => ({ ...prev, blocksRental: !prev.blocksRental }))
          }
          className={`sq-press flex min-h-[48px] w-full items-center justify-between rounded-xl border px-4 text-left text-sm font-medium ${
            editor.blocksRental
              ? 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06]'
              : 'border-border bg-card'
          }`}
        >
          <span>Vermietung blockieren</span>
          <span
            className={`flex h-6 w-11 items-center rounded-full p-0.5 ${
              editor.blocksRental ? 'bg-[color:var(--status-critical)]' : 'bg-muted'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                editor.blocksRental ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        {editorError && (
          <p className="text-xs text-[color:var(--status-critical)]">{editorError}</p>
        )}

        <button
          type="button"
          onClick={addDraft}
          className="sq-3d-btn sq-3d-btn--primary flex min-h-[48px] w-full items-center justify-center gap-2 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          Beobachtung hinzufügen
        </button>
      </div>
    </div>
  );
}
