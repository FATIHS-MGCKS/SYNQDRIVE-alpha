import { useState } from 'react';
import { toast } from 'sonner';
import { DetailDrawer } from '../../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { OrganizationRentalRulesDto } from './rental-rules.types';
import { RentalRuleFieldsForm } from './RentalRuleFieldsForm';
import { RentalRuleLivePreviewPanel } from './RentalRuleLivePreviewPanel';
import {
  formValuesToPatchPayload,
  rulesToFormValues,
  summarizeRuleEntity,
  validateRuleForm,
} from './rental-rules.utils';
import { RentalRulesMutationError, rentalRulesMutate } from './rental-rules-concurrency.errors';
import { RentalRulesConcurrencyDialog } from './RentalRulesConcurrencyDialog';
import { RentalRulePublishImpactPanel } from './RentalRulePublishImpactPanel';
import {
  buildRentalRulesConflictModel,
  mergeServerOrganizationDefaults,
  withExpectedVersion,
} from './rental-rules-concurrency.utils';

interface DefaultRulesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  defaults: OrganizationRentalRulesDto | null;
  canWrite: boolean;
  canPublish?: boolean;
  saving: boolean;
  onSaved: () => Promise<void> | void;
}

export function DefaultRulesDrawer({
  open,
  onOpenChange,
  orgId,
  defaults,
  canWrite,
  canPublish = false,
  saving,
  onSaved,
}: DefaultRulesDrawerProps) {
  const { t } = useLanguage();
  const [values, setValues] = useState(rulesToFormValues(defaults));
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictError, setConflictError] = useState<RentalRulesMutationError | null>(null);
  const [pendingLocalSummary, setPendingLocalSummary] = useState('');

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setValues(rulesToFormValues(defaults));
      setFormError(null);
      setConflictOpen(false);
      setConflictError(null);
    }
    onOpenChange(next);
  };

  const handleSave = async () => {
    const err = validateRuleForm(values);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    const patch = formValuesToPatchPayload(
      values,
      defaults,
      defaults?.configured ? 'edit' : 'create',
    );
    const localSummary = summarizeRuleEntity({ ...defaults, ...patch });
    setPendingLocalSummary(localSummary);
    try {
      await rentalRulesMutate(
        'PATCH',
        `/organizations/${orgId}/rental-rules/defaults`,
        withExpectedVersion(patch, defaults?.version),
      );
      toast.success(t('rentalRules.ui.defaults.saved'));
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

  const handleReload = async () => {
    setConflictOpen(false);
    onOpenChange(false);
    await onSaved();
  };

  const handleEditAgain = () => {
    const merged = mergeServerOrganizationDefaults(defaults, conflictError?.current);
    setConflictOpen(false);
    if (merged) {
      setValues(rulesToFormValues(merged));
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
        onOpenChange={handleOpenChange}
        eyebrow={t('rentalRules.ui.defaults.eyebrow')}
        title={t('rentalRules.ui.defaults.title')}
        description={t('rentalRules.ui.defaults.description')}
        widthClassName="sm:max-w-xl"
        footer={
          canWrite ? (
            <>
              <button type="button" className="sq-btn sq-btn-ghost min-h-9" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="sq-btn sq-btn-primary min-h-9"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? t('common.saving') : t('rentalRules.ui.defaults.save')}
              </button>
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">{t('rentalRules.ui.defaults.readOnly')}</p>
          )
        }
      >
        {!canWrite && (
          <p className="mb-4 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
            {t('rentalRules.ui.defaults.noPermission')}
          </p>
        )}
        {formError && (
          <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {formError}
          </p>
        )}
        <RentalRuleFieldsForm
          values={values}
          onChange={setValues}
          disabled={!canWrite || saving}
          scope="organization"
          baselineRules={defaults}
          showFieldMeta
        />

        <RentalRuleLivePreviewPanel orgId={orgId} scope="defaults" className="mt-6 border-t border-border/70 pt-5" />

        {defaults?.hasUnpublishedDraft && defaults.draftRevision && (
          <RentalRulePublishImpactPanel
            orgId={orgId}
            scope="defaults"
            draftRevision={defaults.draftRevision}
            expectedVersion={defaults.version ?? 0}
            canPublish={canPublish}
            onPublished={onSaved}
          />
        )}
      </DetailDrawer>

      <RentalRulesConcurrencyDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        model={conflictModel}
        onReload={() => void handleReload()}
        onEditAgain={handleEditAgain}
      />
    </>
  );
}
