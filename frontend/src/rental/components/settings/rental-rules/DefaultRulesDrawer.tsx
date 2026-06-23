import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DetailDrawer } from '../../../../components/patterns';
import type { OrganizationRentalRulesDto } from './rental-rules.types';
import { RentalRuleFieldsForm } from './RentalRuleFieldsForm';
import {
  formValuesToPayload,
  rulesToFormValues,
  validateRuleForm,
} from './rental-rules.utils';

interface DefaultRulesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: OrganizationRentalRulesDto | null;
  canWrite: boolean;
  saving: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}

export function DefaultRulesDrawer({
  open,
  onOpenChange,
  defaults,
  canWrite,
  saving,
  onSave,
}: DefaultRulesDrawerProps) {
  const [values, setValues] = useState(rulesToFormValues(defaults));
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(rulesToFormValues(defaults));
      setFormError(null);
    }
  }, [open, defaults]);

  const handleSave = async () => {
    const err = validateRuleForm(values);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    try {
      await onSave(formValuesToPayload(values));
      toast.success('Default rules saved');
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Organization defaults"
      title="Edit default rental rules"
      description="These rules apply when no category or vehicle override is set."
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
              {saving ? 'Saving…' : 'Save defaults'}
            </button>
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground">Read-only access</p>
        )
      }
    >
      {!canWrite && (
        <p className="mb-4 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
          You do not have permission to edit organization rental rules.
        </p>
      )}
      {formError && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {formError}
        </p>
      )}
      <RentalRuleFieldsForm values={values} onChange={setValues} disabled={!canWrite || saving} />
    </DetailDrawer>
  );
}
