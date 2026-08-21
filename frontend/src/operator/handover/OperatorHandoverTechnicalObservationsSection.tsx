import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import type {
  TechnicalObservationAffectedArea,
  TechnicalObservationCategory,
  TechnicalObservationSeverity,
} from '../../lib/api';
import { severityChipClass } from '../../rental/lib/technical-observations-ui';
import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';
import {
  createEmptyObservationDraft,
  OPERATOR_OBSERVATION_QUICK_CHIPS,
  type OperatorHandoverObservationDraft,
} from './operatorHandoverTechnicalObservations';
import {
  labelOperatorObservationArea,
  labelOperatorObservationCategory,
  labelOperatorObservationSeverity,
  oh,
} from './operator-handover-i18n';
import { OperatorHandoverField, operatorTextareaClass } from './operatorHandoverUi';

interface Props {
  form: OperatorHandoverFormApi;
}

const EMPTY_EDITOR = createEmptyObservationDraft();

export function OperatorHandoverTechnicalObservationsSection({ form }: Props) {
  const { locale } = useLanguage();
  const [editor, setEditor] = useState<OperatorHandoverObservationDraft>(EMPTY_EDITOR);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<'category' | 'area' | null>(null);

  const drafts = form.state.technicalObservationDrafts;
  const chipPlaceholder = useMemo(() => {
    const chip = OPERATOR_OBSERVATION_QUICK_CHIPS.find((c) => c.category === editor.category);
    return chip
      ? oh(locale, chip.placeholderKey)
      : oh(locale, 'handover.operator.observations.descriptionFallback');
  }, [editor.category, locale]);

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
      setEditorError(oh(locale, 'handover.operator.observations.minLength'));
      return;
    }
    form.addTechnicalObservationDraft({
      ...editor,
      description,
      id: editor.id || createEmptyObservationDraft().id,
    });
    resetEditor();
  };

  const categoryOptions: TechnicalObservationCategory[] = [
    'exterior',
    'interior',
    'lights',
    'wipers_windows',
    'wheels_tires',
    'electronics_controls',
    'noise_vibration',
    'driving_behavior',
    'comfort',
    'other',
  ];

  const areaOptions: TechnicalObservationAffectedArea[] = [
    'front',
    'rear',
    'left',
    'right',
    'interior',
    'dashboard',
    'lights',
    'wheels',
    'tires',
    'engine_bay',
    'trunk',
    'unknown',
  ];

  const severityOptions: TechnicalObservationSeverity[] = ['low', 'medium', 'high', 'critical'];

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 surface-premium p-4">
      <div>
        <p className="text-sm font-semibold">{oh(locale, 'handover.operator.observations.title')}</p>
        <p className="text-[11px] text-muted-foreground">
          {oh(locale, 'handover.operator.observations.subtitle')}
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
                      {labelOperatorObservationCategory(locale, d.category)}
                    </span>
                    {d.affectedArea && (
                      <span className="text-[10px] text-muted-foreground">
                        {labelOperatorObservationArea(locale, d.affectedArea)}
                      </span>
                    )}
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${severityChipClass(d.severity)}`}
                    >
                      {labelOperatorObservationSeverity(locale, d.severity)}
                    </span>
                    {d.blocksRental && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[color:var(--status-critical)]">
                        <AlertTriangle className="h-3 w-3" />
                        {oh(locale, 'handover.operator.review.blocksRental')}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => form.removeTechnicalObservationDraft(d.id)}
                  className="sq-press flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 text-muted-foreground"
                  aria-label={oh(locale, 'handover.operator.observations.removeAria')}
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
          {oh(locale, 'handover.operator.observations.quickSelect')}
        </p>
        <div className="flex flex-wrap gap-2">
          {OPERATOR_OBSERVATION_QUICK_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => applyQuickChip(chip)}
              className={`sq-press min-h-[40px] rounded-full border px-3 text-xs font-semibold ${
                editor.category === chip.category
                  ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                  : 'border-border surface-premium text-foreground'
              }`}
            >
              {oh(locale, chip.labelKey)}
            </button>
          ))}
        </div>

        <OperatorHandoverField label={oh(locale, 'handover.operator.observations.description')}>
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
            className="sq-press min-h-[48px] rounded-xl border border-border surface-premium px-3 text-left text-sm"
          >
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">
              {oh(locale, 'handover.operator.observations.category')}
            </span>
            <span className="font-medium">
              {labelOperatorObservationCategory(locale, editor.category)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActivePicker((p) => (p === 'area' ? null : 'area'))}
            className="sq-press min-h-[48px] rounded-xl border border-border surface-premium px-3 text-left text-sm"
          >
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">
              {oh(locale, 'handover.operator.observations.area')}
            </span>
            <span className="font-medium">
              {editor.affectedArea
                ? labelOperatorObservationArea(locale, editor.affectedArea)
                : oh(locale, 'handover.operator.observations.areaOptional')}
            </span>
          </button>
        </div>

        {activePicker === 'category' && (
          <div className="grid grid-cols-2 gap-2">
            {categoryOptions.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setEditor((prev) => ({ ...prev, category: value }));
                  setActivePicker(null);
                }}
                className={`sq-press min-h-[44px] rounded-lg border px-2 text-xs font-semibold ${
                  editor.category === value
                    ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]'
                    : 'border-border surface-premium'
                }`}
              >
                {labelOperatorObservationCategory(locale, value)}
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
              className="sq-press min-h-[44px] rounded-lg border border-border surface-premium px-2 text-xs font-semibold"
            >
              {oh(locale, 'handover.operator.observations.noArea')}
            </button>
            {areaOptions.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setEditor((prev) => ({ ...prev, affectedArea: value }));
                  setActivePicker(null);
                }}
                className={`sq-press min-h-[44px] rounded-lg border px-2 text-xs font-semibold ${
                  editor.affectedArea === value
                    ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]'
                    : 'border-border surface-premium'
                }`}
              >
                {labelOperatorObservationArea(locale, value)}
              </button>
            ))}
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {oh(locale, 'handover.operator.observations.severity')}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {severityOptions.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setEditor((prev) => ({ ...prev, severity: value }))}
                className={`sq-press min-h-[44px] rounded-lg border text-xs font-semibold ${
                  editor.severity === value
                    ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]'
                    : 'border-border surface-premium'
                }`}
              >
                {labelOperatorObservationSeverity(locale, value)}
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
              : 'border-border surface-premium'
          }`}
        >
          <span>{oh(locale, 'handover.operator.observations.blockRental')}</span>
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
          {oh(locale, 'handover.operator.observations.add')}
        </button>
      </div>
    </div>
  );
}
