import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DetailDrawer } from '../../../components/patterns';
import { api } from '../../../lib/api';
import type { VehicleRentalRequirementsDto } from '../settings/rental-rules/rental-rules.types';
import { RentalRuleFieldsForm } from '../settings/rental-rules/RentalRuleFieldsForm';
import {
  formValuesToPayload,
  parseApiError,
  rulesToFormValues,
  validateRuleForm,
} from '../settings/rental-rules/rental-rules.utils';
import type { RentalRuleFormValues } from '../settings/rental-rules/rental-rules.types';

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
  const [enabled, setEnabled] = useState(false);
  const [values, setValues] = useState<RentalRuleFormValues>(EMPTY_VALUES);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const ov = requirements?.overrides;
    const anyOverride = Boolean(ov && Object.values(ov).some((v) => v != null));
    setEnabled(anyOverride);
    setValues(rulesToFormValues(ov));
    setFormError(null);
  }, [open, requirements]);

  const handleSave = async () => {
    if (!enabled) {
      setSaving(true);
      try {
        await api.rentalRules.patchVehicleOverrides(orgId, vehicleId, {
          minimumAgeYears: null,
          minimumLicenseHoldingMonths: null,
          depositAmountCents: null,
          creditCardRequired: null,
          foreignTravelPolicy: null,
          additionalDriverPolicy: null,
          youngDriverPolicy: null,
          insuranceRequirement: null,
          manualApprovalRequired: null,
          notes: null,
        });
        toast.success('Overrides cleared — using inherited rules');
        onSaved();
        onOpenChange(false);
      } catch (e: unknown) {
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
      const payload = formValuesToPayload(values);
      const ov = requirements?.overrides;
      const clearKeys: Record<string, null> = {};
      const fields = [
        'minimumAgeYears',
        'minimumLicenseHoldingMonths',
        'depositAmountCents',
        'creditCardRequired',
        'foreignTravelPolicy',
        'additionalDriverPolicy',
        'youngDriverPolicy',
        'insuranceRequirement',
        'manualApprovalRequired',
        'notes',
      ] as const;
      for (const key of fields) {
        if (!(key in payload) && ov && ov[key as keyof typeof ov] != null) {
          clearKeys[key] = null;
        }
      }
      await api.rentalRules.patchVehicleOverrides(orgId, vehicleId, { ...clearKeys, ...payload });
      toast.success('Vehicle overrides saved');
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(parseApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
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
        <RentalRuleFieldsForm values={values} onChange={setValues} disabled={!canWrite || saving} />
      ) : (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          This vehicle follows organization defaults and category rules. Enable the override to set
          vehicle-specific requirements.
        </p>
      )}
    </DetailDrawer>
  );
}
