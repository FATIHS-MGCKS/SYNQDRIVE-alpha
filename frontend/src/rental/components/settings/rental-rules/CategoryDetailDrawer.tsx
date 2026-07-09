import { useEffect, useState } from 'react';
import { Car, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { DetailDrawer, StatusChip } from '../../../../components/patterns';
import type { RentalCategoryVehicleDto, RentalVehicleCategoryDto } from './rental-rules.types';
import { RentalRuleFieldsForm } from './RentalRuleFieldsForm';
import { CATEGORY_COLOR_PRESETS, CATEGORY_TYPE_OPTIONS } from './rental-rules.constants';
import {
  formValuesToPayload,
  labelCategoryType,
  rulesToFormValues,
  validateRuleForm,
} from './rental-rules.utils';

interface CategoryDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  category: RentalVehicleCategoryDto | null;
  assignedVehicles: RentalCategoryVehicleDto[];
  canWrite: boolean;
  saving: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onAssignVehicles: () => void;
  onPreviewVehicle: (vehicleId: string, label: string) => void;
}

export function CategoryDetailDrawer({
  open,
  onOpenChange,
  mode,
  category,
  assignedVehicles,
  canWrite,
  saving,
  onSave,
  onAssignVehicles,
  onPreviewVehicle,
}: CategoryDetailDrawerProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('');
  const [color, setColor] = useState(CATEGORY_COLOR_PRESETS[0]);
  const [ruleValues, setRuleValues] = useState(rulesToFormValues(null));
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && category) {
      setName(category.name);
      setDescription(category.description ?? '');
      setType(category.type ?? '');
      setColor(category.color ?? CATEGORY_COLOR_PRESETS[0]);
      setRuleValues(rulesToFormValues(category));
    } else {
      setName('');
      setDescription('');
      setType('');
      setColor(CATEGORY_COLOR_PRESETS[0]);
      setRuleValues(rulesToFormValues(null));
    }
    setFormError(null);
  }, [open, mode, category]);

  const handleSave = async () => {
    if (!name.trim()) {
      setFormError('Category name is required.');
      return;
    }
    const err = validateRuleForm(ruleValues);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      type: type || null,
      color,
      ...formValuesToPayload(ruleValues),
    };
    try {
      await onSave(payload);
      toast.success(mode === 'create' ? 'Category created' : 'Category updated');
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={mode === 'create' ? 'New category' : 'Edit category'}
      title={mode === 'create' ? 'Create vehicle category' : category?.name ?? 'Category'}
      description="Define eligibility requirements for a group of vehicles."
      status={
        category && !category.isActive ? (
          <StatusChip tone="neutral">Inactive</StatusChip>
        ) : category?.manualApprovalRequired ? (
          <StatusChip tone="warning">Manual approval</StatusChip>
        ) : undefined
      }
      widthClassName="sm:max-w-xl"
      footer={
        canWrite ? (
          <>
            <button type="button" className="sq-btn sq-btn-ghost min-h-9" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="sq-btn sq-btn-primary min-h-9"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Create category' : 'Save changes'}
            </button>
          </>
        ) : undefined
      }
    >
      {formError && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {formError}
        </p>
      )}

      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Name
            </label>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canWrite || saving}
              placeholder="e.g. Premium"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Description
            </label>
            <textarea
              className="min-h-[64px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canWrite || saving}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Type
            </label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={!canWrite || saving}
            >
              <option value="">Not set</option>
              {CATEGORY_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {type && (
              <p className="mt-1 text-[11px] text-muted-foreground">{labelCategoryType(type)}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Accent color
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`h-7 w-7 rounded-full border-2 transition-transform sq-press ${
                    color === c ? 'scale-110 border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  disabled={!canWrite || saving}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-3 text-[13px] font-semibold text-foreground">Category rules</h4>
          <RentalRuleFieldsForm values={ruleValues} onChange={setRuleValues} disabled={!canWrite || saving} />
        </div>

        {mode === 'edit' && category && (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-[13px] font-semibold text-foreground">
                Assigned vehicles ({assignedVehicles.length})
              </h4>
              {canWrite && (
                <button type="button" className="sq-btn sq-btn-ghost min-h-8 text-[12px]" onClick={onAssignVehicles}>
                  Assign vehicles
                </button>
              )}
            </div>
            {assignedVehicles.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No vehicles assigned yet.</p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {assignedVehicles.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/60 surface-premium px-2.5 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Car className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-[12px] text-foreground">
                        {v.licensePlate || '—'} · {v.displayName}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="sq-btn sq-btn-ghost h-7 px-2 text-[11px]"
                      onClick={() => onPreviewVehicle(v.id, v.displayName)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </DetailDrawer>
  );
}
