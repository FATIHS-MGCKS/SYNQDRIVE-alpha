import { useCallback, useEffect, useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { api } from '../../../lib/api';
import { parseHttpErrorCodeFromUnknown, parseHttpErrorStatusFromUnknown } from '../../../lib/http-error-code';
import { isStepUpRequiredError, newIdempotencyKey } from '../../../lib/mfa';
import type { MasterIdentityPrivilegedMutations } from '../useMasterIdentityPrivilegedMutations';
import type { MasterIdentityCreatePendingOp } from '../master-identity-privileged-admission';
import {
  MASTER_IDENTITY_STEP_UP_ACTION,
  executeIdentityPrivilegedMutation,
} from '../master-identity-privileged-admission';
import type { GovernanceGlobalIdentityProvisionResult } from '../types';
import type { OrganizationOperationalRowDto } from '../../organizations/types';
import {
  MEMBERSHIP_ROLE_OPTIONS,
  PROFILE_DATE_FORMATS,
  PROFILE_LOCALE_OPTIONS,
  PROFILE_TIMEZONE_OPTIONS,
} from '../global-profile.constants';
import type { TranslationKey } from '../../../i18n/translations/en';
import { useSecurityAccessPresentation } from '../useSecurityAccessPresentation';

const INPUT =
  'w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-ring';

async function executeCreateWithoutStepUpFence(
  op: MasterIdentityCreatePendingOp,
  assertStillAdmitted: () => boolean,
  onSuccess: (result: unknown) => void | Promise<void>,
) {
  if (!assertStillAdmitted()) throw new Error('IDENTITY_ADMISSION_STALE');
  const result = await executeIdentityPrivilegedMutation(op);
  if (!assertStillAdmitted()) return;
  await onSuccess(result);
}

type OnboardingMode = 'identity' | 'invite' | 'credential';
type Step = 'form' | 'result';

export interface CreateGlobalUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onListRefresh: () => void;
  onOpenCreatedUser: (userId: string) => void;
  identityMutations?: Pick<
    MasterIdentityPrivilegedMutations,
    'runWithStepUp' | 'clearPendingIf' | 'isPendingFor'
  >;
}

export function CreateGlobalUserDialog({
  open,
  onOpenChange,
  onListRefresh,
  onOpenCreatedUser,
  identityMutations,
}: CreateGlobalUserDialogProps) {
  const { t } = useSecurityAccessPresentation();
  const formGenerationRef = useRef(0);
  const operationKeyRef = useRef('');
  const submittedOperationRef = useRef<{
    operationKey: string;
    onboardingMode: OnboardingMode;
    payload: Parameters<typeof api.admin.securityAccess.createUser>[0];
  } | null>(null);
  const listRefreshScheduledRef = useRef(false);
  const submitAdmittedRef = useRef(false);
  const orgRolesRequestRef = useRef(0);

  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [language, setLanguage] = useState('');
  const [timezone, setTimezone] = useState('');
  const [dateFormat, setDateFormat] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [membershipRole, setMembershipRole] = useState<string>('WORKER');
  const [organizationRoleId, setOrganizationRoleId] = useState('');
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>('identity');
  const [orgs, setOrgs] = useState<OrganizationOperationalRowDto[]>([]);
  const [orgRoles, setOrgRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgRolesLoading, setOrgRolesLoading] = useState(false);
  const [orgRolesLoadError, setOrgRolesLoadError] = useState(false);
  const [stepUpUiOpen, setStepUpUiOpen] = useState(false);
  const stepUpGateRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [formLocked, setFormLocked] = useState(false);
  const [submittedOnboardingMode, setSubmittedOnboardingMode] = useState<OnboardingMode | null>(null);
  const [lastError, setLastError] = useState<'conflict' | 'operation' | 'generic' | null>(null);
  const [provisionResult, setProvisionResult] = useState<GovernanceGlobalIdentityProvisionResult | null>(null);

  const resetFormState = useCallback(() => {
    setStep('form');
    setEmail('');
    setFirstName('');
    setLastName('');
    setPhone('');
    setMobile('');
    setLanguage('');
    setTimezone('');
    setDateFormat('');
    setOrganizationId('');
    setMembershipRole('WORKER');
    setOrganizationRoleId('');
    setOnboardingMode('identity');
    setOrgRoles([]);
    setOrgRolesLoadError(false);
    setFormLocked(false);
    setSubmittedOnboardingMode(null);
    setLastError(null);
    setProvisionResult(null);
    setSubmitting(false);
    submitAdmittedRef.current = false;
    submittedOperationRef.current = null;
    listRefreshScheduledRef.current = false;
  }, []);

  const beginNewOperation = useCallback(() => {
    operationKeyRef.current = newIdempotencyKey('ma-global-user-create');
    submittedOperationRef.current = null;
    setSubmittedOnboardingMode(null);
    setFormLocked(false);
    setLastError(null);
  }, []);

  useEffect(() => {
    const onStepUp = () => {
      stepUpGateRef.current = true;
      setStepUpUiOpen(true);
    };
    const onSettled = () => {
      stepUpGateRef.current = false;
      setStepUpUiOpen(false);
    };
    window.addEventListener('synqdrive:step-up-required', onStepUp);
    window.addEventListener('synqdrive:step-up-settled', onSettled);
    return () => {
      window.removeEventListener('synqdrive:step-up-required', onStepUp);
      window.removeEventListener('synqdrive:step-up-settled', onSettled);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    formGenerationRef.current += 1;
    operationKeyRef.current = newIdempotencyKey('ma-global-user-create');
    identityMutations?.clearPendingIf((op) => op.kind === 'create');
    resetFormState();
    setOrgsLoading(true);
    void api.organizations
      .listOperational({ page: 1, limit: 200 })
      .then((res) => {
        const rows = (res.data ?? []) as OrganizationOperationalRowDto[];
        setOrgs(rows.filter((o) => o.orgStatus === 'ACTIVE'));
      })
      .finally(() => setOrgsLoading(false));
  }, [open, resetFormState, identityMutations]);

  useEffect(() => {
    if (!organizationId) {
      orgRolesRequestRef.current += 1;
      setOrgRoles([]);
      setOrganizationRoleId('');
      return;
    }
    const requestId = ++orgRolesRequestRef.current;
    setOrganizationRoleId('');
    setMembershipRole('WORKER');
    setOrgRoles([]);
    setOrgRolesLoadError(false);
    setOrgRolesLoading(true);
    void api.admin.securityAccess
      .listOrgRoles({ organizationId, limit: 100 })
      .then((res) => {
        if (requestId !== orgRolesRequestRef.current) return;
        setOrgRolesLoadError(false);
        setOrgRoles(res.data.map((r) => ({ id: r.id, name: r.name })));
      })
      .catch(() => {
        if (requestId === orgRolesRequestRef.current) {
          setOrgRoles([]);
          setOrgRolesLoadError(true);
        }
      })
      .finally(() => {
        if (requestId === orgRolesRequestRef.current) setOrgRolesLoading(false);
      });
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) {
      setOnboardingMode('identity');
    } else if (onboardingMode === 'identity') {
      setOnboardingMode('invite');
    }
  }, [organizationId]);

  const buildPayload = () => {
    const normalizedEmail = email.trim();
    const body: Parameters<typeof api.admin.securityAccess.createUser>[0] = {
      email: normalizedEmail,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      phone: phone.trim() || undefined,
      mobile: mobile.trim() || undefined,
      language: language.trim() || undefined,
      timezone: timezone.trim() || undefined,
      dateFormat: dateFormat.trim() || undefined,
      idempotencyKey: operationKeyRef.current,
    };
    if (organizationId) {
      body.initialMembership = {
        organizationId,
        role: membershipRole,
        organizationRoleId: organizationRoleId || undefined,
        inviteByEmail: onboardingMode === 'invite',
      };
      if (onboardingMode === 'credential') {
        body.sendCredentialSetup = true;
      }
    }
    return body;
  };

  const submitCreate = async () => {
    if (submitAdmittedRef.current || submitting) return;
    const generationAtStart = formGenerationRef.current;
  const retryFromResult = step === 'result' && submittedOperationRef.current;

    if (!retryFromResult) {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      toast.error(t('master.securityAccess.users.create.validationEmail'));
      return;
    }
    if (!firstName.trim() && !lastName.trim()) {
      toast.error(t('master.securityAccess.users.create.validationName'));
      return;
    }
    if (organizationId && orgRolesLoading) {
      return;
    }
    if (organizationId && orgRolesLoadError) {
      toast.error(t('master.securityAccess.users.create.orgRolesLoadError'));
      return;
    }
    if (
      organizationRoleId &&
      (orgRoles.length === 0 || !orgRoles.some((r) => r.id === organizationRoleId))
    ) {
      toast.error(t('master.securityAccess.users.create.validationOrgRole'));
      return;
    }

    if (!submittedOperationRef.current) {
      const modeForSubmit: OnboardingMode = organizationId ? onboardingMode : 'identity';
      submittedOperationRef.current = {
        operationKey: operationKeyRef.current,
        onboardingMode: modeForSubmit,
        payload: buildPayload(),
      };
      setSubmittedOnboardingMode(modeForSubmit);
    }
    }

    const frozen = submittedOperationRef.current!;
    const pendingOp: MasterIdentityCreatePendingOp = {
      kind: 'create',
      action: MASTER_IDENTITY_STEP_UP_ACTION,
      dialogGeneration: generationAtStart,
      operationKey: frozen.operationKey,
      onboardingMode: frozen.onboardingMode,
      payload: structuredClone(frozen.payload),
    };

    submitAdmittedRef.current = true;
    setSubmitting(true);
    setLastError(null);
    try {
      const assertStillAdmitted = () =>
        open && formGenerationRef.current === generationAtStart && operationKeyRef.current === frozen.operationKey;

      const onSuccess = async (result: unknown) => {
        if (!assertStillAdmitted()) return;
        setProvisionResult(result as GovernanceGlobalIdentityProvisionResult);
        setStep('result');
        setFormLocked(false);
        setLastError(null);
        if (!listRefreshScheduledRef.current) {
          listRefreshScheduledRef.current = true;
          queueMicrotask(() => onListRefresh());
        }
      };

      if (identityMutations?.runWithStepUp) {
        await identityMutations.runWithStepUp({ op: pendingOp, assertStillAdmitted, onSuccess });
      } else {
        await executeCreateWithoutStepUpFence(pendingOp, assertStillAdmitted, onSuccess);
      }
    } catch (err: unknown) {
      if (generationAtStart !== formGenerationRef.current) return;
      const code = parseHttpErrorCodeFromUnknown(err);
      const status = parseHttpErrorStatusFromUnknown(err);
      if (code === 'STEP_UP_REQUIRED' || isStepUpRequiredError(err)) {
        return;
      }
      if (code === 'OPERATION_IDEMPOTENCY_CONFLICT') {
        setLastError('operation');
        setFormLocked(true);
        toast.error(t('master.securityAccess.users.create.operationConflict'));
      } else if (code === 'IDENTITY_ALREADY_EXISTS' || status === 409) {
        setLastError('conflict');
        beginNewOperation();
        toast.error(t('master.securityAccess.users.create.conflict'));
      } else if (status === 400 || code === 'BAD_REQUEST') {
        beginNewOperation();
        toast.error(t('master.securityAccess.users.create.failed'));
      } else {
        setLastError('generic');
        setFormLocked(true);
        toast.error(t('master.securityAccess.users.create.failed'));
      }
    } finally {
      if (generationAtStart === formGenerationRef.current) {
        setSubmitting(false);
        submitAdmittedRef.current = false;
      }
    }
  };

  const handleClose = (next: boolean) => {
    if (!next && (stepUpGateRef.current || stepUpStacked)) {
      return;
    }
    if (!next) {
      identityMutations?.clearPendingIf((op) => op.kind === 'create');
      if (!submitting) {
        resetFormState();
      }
    }
    onOpenChange(next);
  };

  const mutationPending =
    identityMutations?.isPendingFor(
      (op) => op.kind === 'create' && op.dialogGeneration === formGenerationRef.current,
    ) ?? false;
  const stepUpStacked = mutationPending || stepUpUiOpen;

  return (
    <Dialog open={open} onOpenChange={handleClose} modal={!stepUpStacked}>
      <DialogContent
        className={`sm:max-w-lg max-h-[90vh] overflow-y-auto${stepUpStacked ? ' pointer-events-none' : ''}`}
        data-testid="create-global-user-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            {step === 'form'
              ? t('master.securityAccess.users.create.title')
              : t('master.securityAccess.users.create.result.title')}
          </DialogTitle>
          <DialogDescription>
            {step === 'form' ? t('master.securityAccess.users.create.description') : provisionResult?.user.email}
          </DialogDescription>
        </DialogHeader>

        {step === 'form' ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitCreate();
            }}
          >
            {formLocked || mutationPending ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100">
                {t('master.securityAccess.users.create.submittedLocked')}
              </p>
            ) : null}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">{t('master.securityAccess.users.create.email')}</span>
              <input
                type="email"
                className={INPUT}
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                disabled={formLocked || mutationPending}
                autoComplete="off"
                data-testid="create-user-email"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">
                  {t('master.securityAccess.users.create.firstName')}
                </span>
                <input
                  type="text"
                  className={INPUT}
                  value={firstName}
                  onChange={(ev) => setFirstName(ev.target.value)}
                  disabled={formLocked || mutationPending}
                  data-testid="create-user-first-name"
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">
                  {t('master.securityAccess.users.create.lastName')}
                </span>
                <input
                  type="text"
                  className={INPUT}
                  value={lastName}
                  onChange={(ev) => setLastName(ev.target.value)}
                  disabled={formLocked || mutationPending}
                  data-testid="create-user-last-name"
                />
              </label>
            </div>

            <label className="block space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">
                {t('master.securityAccess.users.create.organization')}
              </span>
              <select
                className={INPUT}
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                disabled={orgsLoading || formLocked || mutationPending}
                data-testid="create-user-organization"
              >
                <option value="">{t('master.securityAccess.users.create.organizationNone')}</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.companyName}
                  </option>
                ))}
              </select>
            </label>

            {organizationId ? (
              <>
                <label className="block space-y-1 text-xs">
                  <span className="font-medium text-muted-foreground">
                    {t('master.securityAccess.users.create.membershipRole')}
                  </span>
                  <select
                    className={INPUT}
                    value={membershipRole}
                    onChange={(e) => setMembershipRole(e.target.value)}
                    disabled={formLocked || mutationPending}
                    data-testid="create-user-membership-role"
                  >
                    {MEMBERSHIP_ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-xs">
                  <span className="font-medium text-muted-foreground">
                    {t('master.securityAccess.users.create.organizationRole')}
                  </span>
                  <select
                    className={INPUT}
                    value={organizationRoleId}
                    onChange={(e) => setOrganizationRoleId(e.target.value)}
                    disabled={orgRolesLoading || formLocked || mutationPending || orgRolesLoadError}
                    data-testid="create-user-org-role"
                    aria-busy={orgRolesLoading}
                  >
                    <option value="">{t('master.securityAccess.users.create.organizationRoleNone')}</option>
                    {orgRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {orgRolesLoadError ? (
                    <p className="text-[10px] text-destructive">
                      {t('master.securityAccess.users.create.orgRolesLoadError')}
                    </p>
                  ) : null}
                </label>
                <fieldset className="space-y-1 text-xs" disabled={formLocked || mutationPending}>
                  <legend className="font-medium text-muted-foreground">
                    {t('master.securityAccess.users.create.onboardingMode')}
                  </legend>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="onboarding"
                      checked={onboardingMode === 'invite'}
                      onChange={() => setOnboardingMode('invite')}
                    />
                    {t('master.securityAccess.users.create.onboarding.invite')}
                  </label>
                  <label className="flex items-center gap-2 opacity-90">
                    <input
                      type="radio"
                      name="onboarding"
                      checked={onboardingMode === 'credential'}
                      onChange={() => setOnboardingMode('credential')}
                    />
                    {t('master.securityAccess.users.create.onboarding.credential')}
                  </label>
                  <p className="text-[10px] text-muted-foreground">
                    {t('master.securityAccess.users.create.onboarding.credentialHint')}
                  </p>
                </fieldset>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {t('master.securityAccess.users.create.onboarding.identityHint')}
              </p>
            )}

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                {t('master.securityAccess.users.create.optionalLanguage')}
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select className={INPUT} value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="">—</option>
                  {PROFILE_LOCALE_OPTIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <select className={INPUT} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  <option value="">—</option>
                  {PROFILE_TIMEZONE_OPTIONS.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
                <select
                  className={INPUT}
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                >
                  <option value="">—</option>
                  {PROFILE_DATE_FORMATS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </details>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
                {t('master.securityAccess.users.create.cancel')}
              </Button>
              {formLocked || lastError === 'operation' ? (
                <Button type="button" variant="ghost" disabled={submitting} onClick={beginNewOperation}>
                  {t('master.securityAccess.users.create.startNewOperation')}
                </Button>
              ) : null}
              {lastError && lastError !== 'conflict' ? (
                <Button type="button" variant="secondary" disabled={submitting} onClick={() => void submitCreate()}>
                  {t('master.securityAccess.users.create.retry')}
                </Button>
              ) : null}
              <Button
                type="submit"
                disabled={
                  submitting ||
                  (Boolean(organizationId) &&
                    (orgRolesLoading || orgRolesLoadError || (organizationRoleId !== '' && orgRoles.length === 0)))
                }
                data-testid="create-user-submit"
              >
                {submitting
                  ? t('master.securityAccess.users.create.submitting')
                  : t('master.securityAccess.users.create.submit')}
              </Button>
            </DialogFooter>
          </form>
        ) : provisionResult ? (
          <ProvisionResultView
            result={provisionResult}
            onboardingMode={submittedOnboardingMode ?? (organizationId ? onboardingMode : 'identity')}
            t={t}
            onRetry={
              submittedOperationRef.current
                ? () => void submitCreate()
                : undefined
            }
            retrying={submitting}
            onOpenUser={() => {
              onOpenCreatedUser(provisionResult.user.id);
              handleClose(false);
            }}
            onDone={() => handleClose(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProvisionResultView({
  result,
  onboardingMode,
  t,
  onOpenUser,
  onDone,
  onRetry,
  retrying,
}: {
  result: GovernanceGlobalIdentityProvisionResult;
  onboardingMode: OnboardingMode;
  t: (k: TranslationKey, vars?: Record<string, string>) => string;
  onOpenUser: () => void;
  onDone: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const o = result.onboarding;
  const modeLabel =
    onboardingMode === 'credential'
      ? t('master.securityAccess.users.create.result.onboardingCredential')
      : onboardingMode === 'invite'
        ? t('master.securityAccess.users.create.result.onboardingInvite')
        : t('master.securityAccess.users.create.result.onboardingIdentity');
  const deliveryLabel =
    onboardingMode === 'credential'
      ? o.deliveryConfirmed
        ? t('master.securityAccess.users.create.result.credentialDeliveryConfirmed')
        : o.deliveryRequested
          ? t('master.securityAccess.users.create.result.credentialDeliveryPending')
          : t('master.securityAccess.users.create.result.deliveryNotRequested')
      : o.deliveryConfirmed
        ? t('master.securityAccess.users.create.result.deliveryConfirmed')
        : o.deliveryRequested
          ? t('master.securityAccess.users.create.result.deliveryPending')
          : t('master.securityAccess.users.create.result.deliveryNotRequested');
  const deliveryPending =
    (onboardingMode === 'credential' || onboardingMode === 'invite') &&
    result.onboarding.deliveryRequested &&
    !result.onboarding.deliveryConfirmed;

  return (
    <div className="space-y-3 text-xs" data-testid="create-user-result">
      <p className="text-muted-foreground">{modeLabel}</p>
      <ul className="space-y-1 rounded-lg border border-border bg-muted/40 p-3">
        <li>
          {o.accountReadyForAuthentication
            ? t('master.securityAccess.users.create.result.authReady')
            : t('master.securityAccess.users.create.result.authNotReady')}
        </li>
        <li>
          {o.invitationPersisted
            ? t('master.securityAccess.users.create.result.invitePersisted')
            : t('master.securityAccess.users.create.result.inviteNotPersisted')}
        </li>
        <li>{deliveryLabel}</li>
        {result.membership ? (
          <li>
            {t('master.securityAccess.users.create.result.membership', {
              status: result.membership.status,
            })}
          </li>
        ) : null}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        {t('master.securityAccess.users.create.result.recovery')}
      </p>
      <DialogFooter className="gap-2 pt-2">
        {deliveryPending && onRetry ? (
          <Button type="button" variant="secondary" disabled={retrying} onClick={onRetry}>
            {t('master.securityAccess.users.create.retry')}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onDone}>
          {t('master.securityAccess.users.create.result.done')}
        </Button>
        <Button type="button" onClick={onOpenUser} data-testid="create-user-open">
          {t('master.securityAccess.users.create.result.openUser')}
        </Button>
      </DialogFooter>
    </div>
  );
}