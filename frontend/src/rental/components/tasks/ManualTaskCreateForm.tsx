import { useState } from 'react';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { ApiTaskType } from '../../../lib/api';
import { TASK_PRIORITIES, type TaskPriorityView } from '../../lib/task-create.utils';
import {
  createChecklistDraft,
  estimatedDurationOptions,
  taskTypeOptions,
  type ManualTaskChecklistDraft,
  type ManualTaskFormState,
} from '../../lib/task-create-form.utils';
import { taskPriorityViewLabel } from '../tasks-settings/tasks-i18n';
import { Icon } from '../ui/Icon';

export interface EntityOption {
  value: string;
  label: string;
}

export interface ManualTaskCreateFormProps {
  form: ManualTaskFormState;
  errors: Record<string, string>;
  checklistItems: ManualTaskChecklistDraft[];
  onFormChange: (patch: Partial<ManualTaskFormState>) => void;
  onChecklistChange: (items: ManualTaskChecklistDraft[]) => void;
  vehicleOptions: EntityOption[];
  assigneeOptions: EntityOption[];
  stationOptions: EntityOption[];
  bookingOptions: EntityOption[];
  customerOptions: EntityOption[];
  invoiceOptions: EntityOption[];
  vendorOptions: EntityOption[];
  serviceCaseOptions: EntityOption[];
  lockedVehicleId?: string;
  lockedBookingId?: string;
  showVehicleField?: boolean;
  showLinksSection?: boolean;
  showChecklistSection?: boolean;
  canBlockVehicleAvailability?: boolean;
  disabled?: boolean;
}

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-1 focus:ring-[color:var(--brand-soft)]';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground';

export function ManualTaskCreateForm({
  form,
  errors,
  checklistItems,
  onFormChange,
  onChecklistChange,
  vehicleOptions,
  assigneeOptions,
  stationOptions,
  bookingOptions,
  customerOptions,
  invoiceOptions,
  vendorOptions,
  serviceCaseOptions,
  lockedVehicleId,
  lockedBookingId,
  showVehicleField = true,
  showLinksSection = true,
  showChecklistSection = true,
  canBlockVehicleAvailability = false,
  disabled = false,
}: ManualTaskCreateFormProps) {
  const { t, locale } = useLanguage();
  const typeOptions = taskTypeOptions(locale);
  const durationOptions = estimatedDurationOptions(locale);
  const [linksOpen, setLinksOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);

  return (
    <div className="space-y-5" data-testid="manual-task-create-form">
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('tasks.form.basics')}</h3>
        <label className="block">
          <span className={labelClass}>{t('tasks.form.titleRequired')}</span>
          <input
            type="text"
            value={form.title}
            disabled={disabled}
            onChange={(event) => onFormChange({ title: event.target.value })}
            className={inputClass}
            placeholder={t('tasks.form.titlePlaceholder')}
          />
          {errors.title ? <FieldError message={errors.title} /> : null}
        </label>
        <label className="block">
          <span className={labelClass}>{t('tasks.form.description')}</span>
          <textarea
            rows={3}
            value={form.description}
            disabled={disabled}
            onChange={(event) => onFormChange({ description: event.target.value })}
            className={`${inputClass} resize-y`}
            placeholder={t('tasks.form.descriptionPlaceholder')}
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>{t('tasks.form.taskType')}</span>
            <select
              value={form.type}
              disabled={disabled}
              onChange={(event) => onFormChange({ type: event.target.value as ApiTaskType })}
              className={inputClass}
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className={labelClass}>{t('tasks.form.priority')}</span>
            <div className="flex flex-wrap gap-1.5">
              {TASK_PRIORITIES.map((priority) => (
                <button
                  key={priority}
                  type="button"
                  disabled={disabled}
                  onClick={() => onFormChange({ priority: priority as TaskPriorityView })}
                  className={`flex-1 rounded-lg border px-2 py-2 text-[11px] font-semibold ${
                    form.priority === priority
                      ? 'border-transparent bg-[color:var(--brand)] text-white'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {taskPriorityViewLabel(locale, priority)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="block">
          <span className={labelClass}>{t('tasks.form.initialNote')}</span>
          <textarea
            rows={2}
            value={form.initialNote}
            disabled={disabled}
            onChange={(event) => onFormChange({ initialNote: event.target.value })}
            className={`${inputClass} resize-y`}
            placeholder={t('tasks.form.initialNotePlaceholder')}
          />
        </label>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('tasks.form.schedule')}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>{t('tasks.form.activatesAt')}</span>
            <input
              type="datetime-local"
              value={form.activatesAt}
              disabled={disabled}
              onChange={(event) => onFormChange({ activatesAt: event.target.value })}
              className={inputClass}
            />
            {errors.activatesAt ? <FieldError message={errors.activatesAt} /> : null}
          </label>
          <label className="block">
            <span className={labelClass}>{t('tasks.form.dueDate')}</span>
            <input
              type="datetime-local"
              value={form.dueDate}
              disabled={disabled}
              onChange={(event) => onFormChange({ dueDate: event.target.value })}
              className={inputClass}
            />
            {errors.dueDate ? <FieldError message={errors.dueDate} /> : null}
          </label>
          <label className="block">
            <span className={labelClass}>{t('tasks.form.estimatedDuration')}</span>
            <select
              value={form.estimatedDurationMinutes}
              disabled={disabled}
              onChange={(event) => onFormChange({ estimatedDurationMinutes: event.target.value })}
              className={inputClass}
            >
              <option value="">{t('tasks.form.noDuration')}</option>
              {durationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.estimatedDurationMinutes ? (
              <FieldError message={errors.estimatedDurationMinutes} />
            ) : null}
          </label>
          <label className="block">
            <span className={labelClass}>{t('tasks.form.assignee')}</span>
            <select
              value={form.assignedUserId}
              disabled={disabled}
              onChange={(event) => onFormChange({ assignedUserId: event.target.value })}
              className={inputClass}
            >
              <option value="">{t('tasks.display.unassigned')}</option>
              {assigneeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={labelClass}>{t('tasks.form.station')}</span>
            <select
              value={form.stationId}
              disabled={disabled}
              onChange={(event) => onFormChange({ stationId: event.target.value })}
              className={inputClass}
            >
              <option value="">{t('tasks.form.noStation')}</option>
              {stationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {showVehicleField ? (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('tasks.form.vehicle')}</h3>
          <label className="block">
            <span className={labelClass}>{t('tasks.form.vehicle')}</span>
            <select
              value={lockedVehicleId ?? form.vehicleId}
              disabled={disabled || Boolean(lockedVehicleId)}
              onChange={(event) => onFormChange({ vehicleId: event.target.value })}
              className={inputClass}
            >
              <option value="">Kein {t('tasks.form.vehicle')}</option>
              {vehicleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.vehicleId ? <FieldError message={errors.vehicleId} /> : null}
          </label>
        </section>
      ) : null}

      {showLinksSection ? (
        <section className="space-y-3">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-left text-xs font-semibold text-foreground"
            onClick={() => setLinksOpen((open) => !open)}
          >
            {t('tasks.form.links')}
            <Icon name={linksOpen ? 'chevron-up' : 'chevron-down'} className="h-4 w-4" />
          </button>
          {linksOpen ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EntitySelect
                label={t('tasks.form.booking')}
                value={lockedBookingId ?? form.bookingId}
                options={bookingOptions}
                disabled={disabled || Boolean(lockedBookingId)}
                onChange={(value) => onFormChange({ bookingId: value })}
              />
              <EntitySelect
                label={t('tasks.form.customer')}
                value={form.customerId}
                options={customerOptions}
                disabled={disabled}
                onChange={(value) => onFormChange({ customerId: value })}
              />
              <EntitySelect
                label={t('tasks.form.invoice')}
                value={form.invoiceId}
                options={invoiceOptions}
                disabled={disabled}
                onChange={(value) => onFormChange({ invoiceId: value })}
              />
              <EntitySelect
                label={t('tasks.form.vendor')}
                value={form.vendorId}
                options={vendorOptions}
                disabled={disabled}
                onChange={(value) => onFormChange({ vendorId: value })}
              />
              <EntitySelect
                label={t('tasks.form.serviceCase')}
                value={form.serviceCaseId}
                options={serviceCaseOptions}
                disabled={disabled}
                onChange={(value) => onFormChange({ serviceCaseId: value })}
              />
              <label className="block">
                <span className={labelClass}>{t('tasks.form.documentId')}</span>
                <input
                  type="text"
                  value={form.documentId}
                  disabled={disabled}
                  onChange={(event) => onFormChange({ documentId: event.target.value })}
                  className={inputClass}
                  placeholder={t('tasks.form.documentIdPlaceholder')}
                />
              </label>
            </div>
          ) : null}
        </section>
      ) : null}

      {showChecklistSection ? (
        <section className="space-y-3">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-left text-xs font-semibold text-foreground"
            onClick={() => setChecklistOpen((open) => !open)}
          >
            {t('tasks.form.checklist')}
            <Icon name={checklistOpen ? 'chevron-up' : 'chevron-down'} className="h-4 w-4" />
          </button>
          {checklistOpen ? (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-3">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.useTypeChecklistTemplate}
                  disabled={disabled}
                  onChange={(event) => onFormChange({ useTypeChecklistTemplate: event.target.checked })}
                />
                Standard-{t('tasks.form.checklist')} für {t('tasks.form.taskType')} übernehmen
              </label>
              {checklistItems.map((item, index) => (
                <div key={item.id} className="flex items-start gap-2">
                  <input
                    type="text"
                    value={item.title}
                    disabled={disabled}
                    onChange={(event) => {
                      const next = [...checklistItems];
                      next[index] = { ...item, title: event.target.value };
                      onChecklistChange(next);
                    }}
                    className={`${inputClass} flex-1`}
                    placeholder={`{t('tasks.form.checklist')}npunkt ${index + 1}`}
                  />
                  <label className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={item.isRequired}
                      disabled={disabled}
                      onChange={(event) => {
                        const next = [...checklistItems];
                        next[index] = { ...item, isRequired: event.target.checked };
                        onChecklistChange(next);
                      }}
                    />
                    {t('tasks.form.checklistRequired')}
                  </label>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChecklistChange(checklistItems.filter((row) => row.id !== item.id))}
                    className="mt-2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                    aria-label={t('tasks.form.removeChecklistItem')}
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {errors.checklist ? <FieldError message={errors.checklist} /> : null}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChecklistChange([...checklistItems, createChecklistDraft()])}
                className="text-xs font-semibold text-[color:var(--brand)]"
              >
                + {t('tasks.form.checklist')}npunkt hinzufügen
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {canBlockVehicleAvailability ? (
        <label className="flex items-start gap-2.5 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical-soft)]/20 px-3 py-2.5">
          <input
            type="checkbox"
            checked={form.blocksVehicleAvailability}
            disabled={disabled}
            onChange={(event) => onFormChange({ blocksVehicleAvailability: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded accent-[color:var(--status-critical)]"
          />
          <span className="text-[11px] text-foreground">
            <span className="block font-semibold">Blockiert {t('tasks.form.vehicle')}verfügbarkeit</span>
            <span className="text-muted-foreground">
              {t('tasks.form.blocksAvailabilityHint')}
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

function EntitySelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: EntityOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        <option value="">{t('tasks.form.noSelection')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FieldError({ message }: { message: string }) {
  return <p className="mt-1 text-[11px] text-[color:var(--status-critical)]">{message}</p>;
}
