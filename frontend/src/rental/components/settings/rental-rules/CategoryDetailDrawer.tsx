import { useEffect, useState } from 'react';
import { Car, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { DetailDrawer, StatusChip } from '../../../../components/patterns';
import type { RentalCategoryVehicleDto, RentalVehicleCategoryDto, RentalVehicleCategoryStatus, OrganizationRentalRulesDto } from './rental-rules.types';
import { RentalRuleFieldsForm } from './RentalRuleFieldsForm';
import { RentalRuleLivePreviewPanel } from './RentalRuleLivePreviewPanel';
import { CATEGORY_COLOR_PRESETS, CATEGORY_TYPE_OPTIONS } from './rental-rules.constants';
import {
  CATEGORY_LIFECYCLE_ACTIONS,
  CATEGORY_STATUS_TONES,
  categoryAllowsVehicleAssignment,
  labelCategoryStatus,
} from './rental-rules-category-lifecycle.utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { RentalRulesMutationError, rentalRulesMutate } from './rental-rules-concurrency.errors';
import { RentalRulesConcurrencyDialog } from './RentalRulesConcurrencyDialog';
import {
  buildRentalRulesConflictModel,
  mergeServerCategory,
  withExpectedVersion,
} from './rental-rules-concurrency.utils';
import {
  formValuesToPatchPayload,
  labelCategoryType,
  rulesToFormValues,
  summarizeRuleEntity,
  validateRuleForm,
} from './rental-rules.utils';
import { RentalRulePublishImpactPanel } from './RentalRulePublishImpactPanel';

interface CategoryDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  mode: 'create' | 'edit';
  category: RentalVehicleCategoryDto | null;
  organizationDefaults?: OrganizationRentalRulesDto | null;
  assignedVehicles: RentalCategoryVehicleDto[];
  canWrite: boolean;
  canPublish?: boolean;
  canAssignVehicles?: boolean;
  saving: boolean;
  onSaved: () => Promise<void> | void;
  onAssignVehicles: () => void;
  onPreviewVehicle: (vehicleId: string, label: string) => void;
}

export function CategoryDetailDrawer({
  open,
  onOpenChange,
  orgId,
  mode,
  category,
  organizationDefaults,
  assignedVehicles,
  canWrite,
  canPublish = false,
  canAssignVehicles = false,
  saving,
  onSaved,
  onAssignVehicles,
  onPreviewVehicle,
}: CategoryDetailDrawerProps) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('');
  const [color, setColor] = useState(CATEGORY_COLOR_PRESETS[0]);
  const [ruleValues, setRuleValues] = useState(rulesToFormValues(null));
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictError, setConflictError] = useState<RentalRulesMutationError | null>(null);
  const [pendingLocalSummary, setPendingLocalSummary] = useState('');
  const [lifecycleSaving, setLifecycleSaving] = useState(false);

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
    setConflictOpen(false);
    setConflictError(null);
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
      ...formValuesToPatchPayload(
        ruleValues,
        mode === 'edit' ? category : null,
        mode === 'create' ? 'create' : 'edit',
      ),
    };
    const localSummary = summarizeRuleEntity({ ...category, ...payload });
    setPendingLocalSummary(localSummary);
    try {
      if (mode === 'create') {
        await rentalRulesMutate('POST', `/organizations/${orgId}/rental-rules/categories`, payload);
      } else if (category) {
        await rentalRulesMutate(
          'PATCH',
          `/organizations/${orgId}/rental-rules/categories/${category.id}`,
          withExpectedVersion(payload, category.version),
        );
      }
      toast.success(mode === 'create' ? 'Category created' : 'Category updated');
      await onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      if (e instanceof RentalRulesMutationError && e.isVersionConflict) {
        setConflictError(e);
        setConflictOpen(true);
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleLifecycle = async (targetStatus: RentalVehicleCategoryStatus) => {
    if (!category) return;
    setLifecycleSaving(true);
    try {
      await rentalRulesMutate(
        'POST',
        `/organizations/${orgId}/rental-rules/categories/${category.id}/lifecycle`,
        withExpectedVersion({ targetStatus }, category.version),
      );
      toast.success(`Category ${labelCategoryStatus(targetStatus).toLowerCase()}`);
      await onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      if (e instanceof RentalRulesMutationError && e.isVersionConflict) {
        setConflictError(e);
        setConflictOpen(true);
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Lifecycle update failed');
    } finally {
      setLifecycleSaving(false);
    }
  };

  const isArchived = category?.status === 'ARCHIVED';
  const lifecycleActions = category ? CATEGORY_LIFECYCLE_ACTIONS[category.status] : [];

  const conflictModel =
    conflictError != null
      ? buildRentalRulesConflictModel(t, conflictError, pendingLocalSummary)
      : null;

  return (
    <>
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={mode === 'create' ? 'New category' : 'Edit category'}
      title={mode === 'create' ? 'Create vehicle category' : category?.name ?? 'Category'}
      description="Define eligibility requirements for a group of vehicles."
      status={
        category ? (
          <StatusChip tone={CATEGORY_STATUS_TONES[category.status]}>
            {labelCategoryStatus(category.status)}
          </StatusChip>
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
              disabled={saving || lifecycleSaving || isArchived}
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
              disabled={!canWrite || saving || lifecycleSaving || isArchived}
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
              disabled={!canWrite || saving || lifecycleSaving || isArchived}
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
              disabled={!canWrite || saving || lifecycleSaving || isArchived}
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
                  disabled={!canWrite || saving || lifecycleSaving || isArchived}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>

        {mode === 'edit' && category && canPublish && lifecycleActions.length > 0 && (
          <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
            <h4 className="mb-2 text-[13px] font-semibold text-foreground">Lifecycle</h4>
            <p className="mb-3 text-[11px] text-muted-foreground">
              {category.status === 'INACTIVE' || category.status === 'ARCHIVED'
                ? 'Inactive and archived categories stay visible here. Assigned vehicles keep their link; only active categories enforce category rules on new eligibility checks.'
                : 'Publish or archive this category without losing history.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {lifecycleActions.map((action) => (
                <button
                  key={action.targetStatus}
                  type="button"
                  className="sq-btn sq-btn-ghost min-h-8 text-[12px]"
                  disabled={lifecycleSaving || saving}
                  onClick={() => void handleLifecycle(action.targetStatus)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="mb-3 text-[13px] font-semibold text-foreground">Category rules</h4>
          <RentalRuleFieldsForm
            values={ruleValues}
            onChange={setRuleValues}
            disabled={!canWrite || saving || lifecycleSaving || isArchived}
            scope="category"
            parentRules={organizationDefaults}
            baselineRules={mode === 'edit' ? category : null}
            showFieldMeta
          />
        </div>

        {mode === 'edit' && category ? (
          <RentalRuleLivePreviewPanel
            orgId={orgId}
            scope="category"
            scopeEntityId={category.id}
            className="border-t border-border/70 pt-5"
          />
        ) : null}

        {mode === 'edit' && category?.hasUnpublishedDraft && category.draftRevision && (
          <RentalRulePublishImpactPanel
            orgId={orgId}
            scope="category"
            scopeEntityId={category.id}
            draftRevision={category.draftRevision}
            expectedVersion={category.version}
            canPublish={canPublish}
            onPublished={onSaved}
          />
        )}

        {mode === 'edit' && category && (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-[13px] font-semibold text-foreground">
                Assigned vehicles ({assignedVehicles.length})
              </h4>
              {canAssignVehicles && categoryAllowsVehicleAssignment(category.status) && (
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

    <RentalRulesConcurrencyDialog
      open={conflictOpen}
      onOpenChange={setConflictOpen}
      model={conflictModel}
      onReload={async () => {
        setConflictOpen(false);
        onOpenChange(false);
        await onSaved();
      }}
      onEditAgain={() => {
        const merged = mergeServerCategory(category, conflictError?.current);
        setConflictOpen(false);
        if (merged) {
          setName(merged.name);
          setDescription(merged.description ?? '');
          setType(merged.type ?? '');
          setColor(merged.color ?? CATEGORY_COLOR_PRESETS[0]);
          setRuleValues(rulesToFormValues(merged));
        }
      }}
    />
    </>
  );
}
