import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { FormDialog } from '../../../../components/patterns';
import { api, type LegalDocumentDto, type LegalDocumentEventDto } from '../../../../lib/api';
import { getStoredUser } from '../../../../lib/auth';
import { LEGAL_LIFECYCLE_ACTION_CONFIG } from '../../../lib/legal-document-lifecycle.constants';
import {
  formatLegalDocumentMutationError,
  LegalDocumentMutationError,
  postLegalDocumentMutation,
} from '../../../lib/legal-document-lifecycle.errors';
import {
  EMPTY_LIFECYCLE_FORM,
  type LegalDocumentLifecycleDialogState,
  type LegalDocumentLifecycleFormState,
  type LegalDocumentLifecyclePermissions,
  type LegalDocumentWorkflowSettings,
} from '../../../lib/legal-document-lifecycle.types';
import {
  formatLifecycleEventLabel,
  validateLifecycleForm,
  violatesFourEyes,
} from '../../../lib/legal-document-lifecycle.utils';
import { LegalDocumentLifecycleImpactPanel } from './LegalDocumentLifecycleImpactPanel';

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-soft)]';

export interface LegalDocumentLifecycleActionDialogProps {
  open: boolean;
  state: LegalDocumentLifecycleDialogState | null;
  settings: LegalDocumentWorkflowSettings;
  permissions: LegalDocumentLifecyclePermissions;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: {
    document: LegalDocumentDto;
    latestEvent: LegalDocumentEventDto | null;
  }) => Promise<void>;
  onConflict: () => Promise<void>;
}

export function LegalDocumentLifecycleActionDialog({
  open,
  state,
  settings,
  permissions,
  onOpenChange,
  onSuccess,
  onConflict,
}: LegalDocumentLifecycleActionDialogProps) {
  const [form, setForm] = useState<LegalDocumentLifecycleFormState>(EMPTY_LIFECYCLE_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof LegalDocumentLifecycleFormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successEvent, setSuccessEvent] = useState<LegalDocumentEventDto | null>(null);

  const action = state?.action;
  const document = state?.document;
  const activePeer = state?.activePeer ?? null;
  const config = action ? LEGAL_LIFECYCLE_ACTION_CONFIG[action] : null;
  const currentUserId = getStoredUser()?.id ?? null;

  const fourEyesBlocked =
    document && action
      ? (action === 'approve' && violatesFourEyes(document, currentUserId, settings, 'approve')) ||
        ((action === 'activate_now' || action === 'replace_active') &&
          violatesFourEyes(document, currentUserId, settings, 'activate'))
      : false;

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_LIFECYCLE_FORM);
      setErrors({});
      setSubmitError(null);
      setSuccessEvent(null);
      setSubmitting(false);
    }
  }, [open, action, document?.id]);

  if (!open || !action || !document || !config) return null;

  const runMutation = async () => {
    const orgId = getStoredUser()?.organizationId;
    if (!orgId) throw new Error('Organisation nicht verfügbar');

    switch (action) {
      case 'submit_review':
        return postLegalDocumentMutation(orgId, `/${document.id}/submit-for-review`, {
          changeSummary: form.changeSummary.trim() || undefined,
        });
      case 'request_changes':
        return postLegalDocumentMutation(orgId, `/${document.id}/request-changes`, {
          statusReason: form.statusReason.trim(),
          changeSummary: form.changeSummary.trim() || undefined,
        });
      case 'approve':
        return postLegalDocumentMutation(orgId, `/${document.id}/approve`, {
          changeSummary: form.changeSummary.trim() || undefined,
        });
      case 'schedule_activation':
        return postLegalDocumentMutation(orgId, `/${document.id}/schedule`, {
          validFrom: new Date(form.validFrom).toISOString(),
          changeSummary: form.changeSummary.trim() || form.statusReason.trim() || undefined,
        });
      case 'activate_now':
      case 'replace_active':
        return postLegalDocumentMutation(orgId, `/${document.id}/activate`, {
          statusReason: form.statusReason.trim(),
          changeSummary: form.changeSummary.trim() || undefined,
        });
      case 'revoke':
        return postLegalDocumentMutation(orgId, `/${document.id}/revoke`, {
          statusReason: form.statusReason.trim(),
          changeSummary: form.changeSummary.trim() || undefined,
        });
      case 'archive':
        return postLegalDocumentMutation(orgId, `/${document.id}/archive`, {
          statusReason: form.statusReason.trim() || undefined,
          changeSummary: form.changeSummary.trim() || undefined,
        });
      default:
        throw new Error('Unbekannte Aktion');
    }
  };

  const loadLatestEvent = async (documentId: string): Promise<LegalDocumentEventDto | null> => {
    const orgId = getStoredUser()?.organizationId;
    if (!orgId) return null;
    try {
      const page = await api.legalDocuments.listEvents(orgId, {
        legalDocumentId: documentId,
        page: 1,
        limit: 1,
      });
      return page.data[0] ?? null;
    } catch {
      return null;
    }
  };

  const handleSubmit = async () => {
    const nextErrors = validateLifecycleForm(action, form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (fourEyesBlocked) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const updated = await runMutation();
      const event = await loadLatestEvent(updated.id);
      setSuccessEvent(event);
      await onSuccess({ document: updated, latestEvent: event });
    } catch (err) {
      if (err instanceof LegalDocumentMutationError && err.isConflict) {
        setSubmitError(formatLegalDocumentMutationError(err));
        await onConflict();
        return;
      }
      setSubmitError(formatLegalDocumentMutationError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    !submitting &&
    !fourEyesBlocked &&
    !successEvent &&
    ((action === 'approve' || action === 'activate_now' || action === 'replace_active' || action === 'revoke')
      ? permissions.canManage
      : permissions.canWrite);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      maxWidthClassName="sm:max-w-xl"
      hideClose={submitting}
      title={config.title}
      description={`Status: ${document.status} · v${document.versionLabel}`}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {successEvent ? 'Schließen' : 'Abbrechen'}
          </Button>
          {!successEvent ? (
            <Button
              type="button"
              variant={config.tone === 'critical' ? 'destructive' : 'primary'}
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
              data-testid="legal-lifecycle-dialog-confirm"
            >
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {config.confirmLabel}
            </Button>
          ) : null}
        </div>
      }
    >
      <div data-testid="legal-lifecycle-dialog-body">
        <LegalDocumentLifecycleImpactPanel
          action={action}
          document={document}
          activePeer={activePeer}
          fourEyesEnabled={settings.fourEyesEnabled}
          fourEyesBlocked={fourEyesBlocked}
        />

        {config.requiresValidFrom ? (
          <div className="mt-4">
            <label htmlFor="validFrom" className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Gültig ab (geplante Aktivierung) *
            </label>
            <input
              id="validFrom"
              type="datetime-local"
              value={form.validFrom}
              onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
              className={fieldClass}
              disabled={submitting || Boolean(successEvent)}
            />
            {errors.validFrom ? (
              <p className="mt-1 text-[11px] text-[color:var(--status-critical)]" role="alert">
                {errors.validFrom}
              </p>
            ) : null}
          </div>
        ) : null}

        {config.requiresReason ? (
          <div className="mt-4">
            <label htmlFor="statusReason" className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Begründung *
            </label>
            <textarea
              id="statusReason"
              rows={3}
              value={form.statusReason}
              onChange={(e) => setForm((prev) => ({ ...prev, statusReason: e.target.value }))}
              className={fieldClass}
              disabled={submitting || Boolean(successEvent)}
              placeholder="Pflichtbegründung für Audit und Nachvollziehbarkeit"
            />
            {errors.statusReason ? (
              <p className="mt-1 text-[11px] text-[color:var(--status-critical)]" role="alert">
                {errors.statusReason}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4">
          <label htmlFor="changeSummary" className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            Änderungshinweis (optional)
          </label>
          <textarea
            id="changeSummary"
            rows={2}
            value={form.changeSummary}
            onChange={(e) => setForm((prev) => ({ ...prev, changeSummary: e.target.value }))}
            className={fieldClass}
            disabled={submitting || Boolean(successEvent)}
          />
        </div>

        {submitError ? (
          <p className="mt-3 text-[12px] text-[color:var(--status-critical)]" role="alert">
            {submitError}
          </p>
        ) : null}

        {successEvent ? (
          <div
            className="mt-4 rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-[12px]"
            data-testid="legal-lifecycle-success-event"
          >
            <p className="font-medium text-foreground">Aktion bestätigt</p>
            <p className="text-muted-foreground">
              Audit: {formatLifecycleEventLabel(successEvent.eventType)} ·{' '}
              {new Date(successEvent.createdAt).toLocaleString('de-DE')}
            </p>
          </div>
        ) : null}
      </div>
    </FormDialog>
  );
}
