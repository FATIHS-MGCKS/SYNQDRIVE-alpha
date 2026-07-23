import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DetailDrawer } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { VehicleRentalRequirementsDto } from '../settings/rental-rules/rental-rules.types';
import { RentalRuleFieldsForm } from '../settings/rental-rules/RentalRuleFieldsForm';
import { RentalRuleLivePreviewPanel } from '../settings/rental-rules/RentalRuleLivePreviewPanel';
import { RentalRulePublishImpactPanel } from '../settings/rental-rules/RentalRulePublishImpactPanel';
import {
  formValuesToPatchPayload,
  parseApiError,
  rulesToFormValues,
  summarizeRuleEntity,
  validateRuleForm,
} from '../settings/rental-rules/rental-rules.utils';
import type { RentalRuleFormValues } from '../settings/rental-rules/rental-rules.types';
import { RentalRulesMutationError, rentalRulesMutate } from '../settings/rental-rules/rental-rules-concurrency.errors';
import { RentalRulesConcurrencyDialog } from '../settings/rental-rules/RentalRulesConcurrencyDialog';
import {
  buildRentalRulesConflictModel,
  withExpectedVersion,
} from '../settings/rental-rules/rental-rules-concurrency.utils';

interface VehicleOverrideEditorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  vehicleId: string;
  requirements: VehicleRentalRequirementsDto | null;
  canWrite: boolean;
  onSaved: () => void;
}

const EMPTY_VALUES = rulesToFormValues(null);

export function VehicleOverrideEditorDrawer({
  open,
  onOpenChange,
  orgId,
  vehicleId,
  requirements,
  canWrite,
  onSaved,
}: VehicleOverrideEditorDrawerProps) {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState(false);
  const [values, setValues] = useState<RentalRuleFormValues>(EMPTY_VALUES);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictError, setConflictError] = useState<RentalRulesMutationError | null>(null);
  const [pendingLocalSummary, setPendingLocalSummary] = useState('');

  useEffect(() => {
    if (!open) return;
    const ov = requirements?.overrides;
    const anyOverride = Boolean(ov && Object.values(ov).some((v) => v != null));
    setEnabled(anyOverride);
    setValues(rulesToFormValues(ov));
    setFormError(null);
    setConflictOpen(false);
    setConflictError(null);
  }, [open, requirements]);

  const handleSave = async () => {
    const overrideVersion = requirements?.overrides?.version;
    if (!enabled) {
      setSaving(true);
      try {
        if (requirements?.overrides) {
          await rentalRulesMutate(
            'POST',
            `/organizations/${orgId}/vehicles/${vehicleId}/rental-requirements/overrides/reset`,
            withExpectedVersion({}, overrideVersion),
          );
        }
        toast.success('Overrides cleared — using inherited rules');
        onSaved();
        onOpenChange(false);
      } catch (e: unknown) {
        if (e instanceof RentalRulesMutationError && e.isVersionConflict) {
          setConflictError(e);
          setPendingLocalSummary(t('rentalRules.concurrency.clearOverridesAttempt'));
          setConflictOpen(true);
          return;
        }
        toast.error(parseApiError(e));
      } finally {
        setSaving(false);
      }
      return;
    }

    const err = validateRuleForm(values);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const payload = formValuesToPatchPayload(values, requirements?.overrides, 'edit');
      const localSummary = summarizeRuleEntity({ ...requirements?.overrides, ...payload });
      setPendingLocalSummary(localSummary);
      await rentalRulesMutate(
        'PATCH',
        `/organizations/${orgId}/vehicles/${vehicleId}/rental-requirements/overrides`,
        withExpectedVersion(payload, overrideVersion),
      );
      toast.success('Vehicle overrides saved');
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      if (e instanceof RentalRulesMutationError && e.isVersionConflict) {
        setConflictError(e);
        setConflictOpen(true);
        return;
      }
      toast.error(parseApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const conflictModel =
    conflictError != null
      ? buildRentalRulesConflictModel(t, conflictError, pendingLocalSummary)
      : null;

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={onOpenChange}
        eyebrow="Vehicle overrides"
        title="Edit requirement overrides"
        description="Leave override disabled to inherit organization and category rules."
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
                {saving ? 'Saving…' : 'Save overrides'}
              </button>
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">Read-only access</p>
          )
        }
      >
        <div className="mb-4 rounded-xl border border-border/60 bg-muted/15 p-3.5">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-foreground">Override for this vehicle</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {enabled
                  ? 'Vehicle-specific values replace inherited rules.'
                  : 'Inherited from organization defaults and category.'}
              </p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={enabled}
              disabled={!canWrite || saving}
              onChange={(e) => setEnabled(e.target.checked)}
            />
          </label>
        </div>

        {formError && (
          <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {formError}
          </p>
        )}

        {enabled ? (
          <>
            <RentalRuleFieldsForm
              values={values}
              onChange={setValues}
              disabled={!canWrite || saving}
              scope="vehicle"
              parentRules={null}
              baselineRules={requirements?.overrides}
              showFieldMeta
            />
            <RentalRuleLivePreviewPanel
              orgId={orgId}
              scope="vehicle"
              scopeEntityId={vehicleId}
              className="mt-6 border-t border-border/70 pt-5"
            />
            {requirements?.hasUnpublishedDraft && requirements.draftRevision ? (
              <RentalRulePublishImpactPanel
                orgId={orgId}
                scope="vehicle"
                scopeEntityId={vehicleId}
                draftRevision={requirements.draftRevision}
                expectedVersion={requirements.overrides?.version ?? 0}
                canPublish={canWrite}
                onPublished={onSaved}
              />
            ) : null}
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            This vehicle follows organization defaults and category rules. Enable the override to set
            vehicle-specific requirements.
          </p>
        )}
      </DetailDrawer>

      <RentalRulesConcurrencyDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        model={conflictModel}
        onReload={() => {
          setConflictOpen(false);
          onOpenChange(false);
          onSaved();
        }}
        onEditAgain={() => {
          setConflictOpen(false);
          const server = conflictError?.current;
          if (server) {
            setEnabled(true);
            setValues(rulesToFormValues(server as unknown as VehicleRentalRequirementsDto['overrides']));
          }
        }}
      />
    </>
  );
}
