import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';
import { parseHttpErrorCodeFromUnknown, parseHttpErrorStatusFromUnknown } from '../../../lib/http-error-code';
import { newIdempotencyKey } from '../../../lib/mfa';
import type { MasterIdentityPrivilegedMutations } from '../useMasterIdentityPrivilegedMutations';
import type { GovernanceGlobalProfileDto, GovernanceUserDetailDto } from '../types';
import { useSecurityAccessPresentation } from '../useSecurityAccessPresentation';
import {
  PROFILE_DATE_FORMATS,
  PROFILE_LOCALE_OPTIONS,
  PROFILE_TIMEZONE_OPTIONS,
} from '../global-profile.constants';
import {
  buildChangedProfilePatch,
  draftsEqualForNoOp,
  profileDtoToDraft,
  type ProfileDraft,
} from '../global-profile-patch.util';
import {
  MASTER_IDENTITY_STEP_UP_ACTION,
  executeIdentityPrivilegedMutation,
  type MasterIdentityProfilePendingOp,
} from '../master-identity-privileged-admission';

const INPUT =
  'w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-ring';

export interface GlobalProfileEditPanelProps {
  userId: string;
  detail: GovernanceUserDetailDto;
  drawerGeneration: number;
  onSaved: () => void;
  isMutationTargetCurrent: (userId: string, generationAtStart: number) => boolean;
  identityMutations?: Pick<
    MasterIdentityPrivilegedMutations,
    'runWithStepUp' | 'clearPendingIf' | 'isPendingFor'
  >;
}

export function GlobalProfileEditPanel({
  userId,
  detail,
  drawerGeneration,
  onSaved,
  isMutationTargetCurrent,
  identityMutations,
}: GlobalProfileEditPanelProps) {
  const { t } = useSecurityAccessPresentation();
  const bindGenerationRef = useRef(drawerGeneration);
  const baselineRef = useRef<GovernanceGlobalProfileDto | null>(null);
  const draftDirtyRef = useRef(false);
  const saveOperationKeyRef = useRef(newIdempotencyKey('ma-global-profile'));
  const submittedPatchRef = useRef<{
    operationKey: string;
    patch: Parameters<typeof api.admin.securityAccess.updateUserProfile>[1];
  } | null>(null);
  const submitAdmittedRef = useRef(false);

  const [snapshot, setSnapshot] = useState<GovernanceGlobalProfileDto | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    bindGenerationRef.current = drawerGeneration;
    saveOperationKeyRef.current = newIdempotencyKey('ma-global-profile');
    identityMutations?.clearPendingIf(
      (op) => op.kind === 'profile' && (op.userId !== userId || op.drawerGeneration !== drawerGeneration),
    );
    const profile = detail.globalProfile;
    setSnapshot(profile);
    setDraft(profileDtoToDraft(profile));
    baselineRef.current = profile;
    draftDirtyRef.current = false;
    setSaving(false);
    submitAdmittedRef.current = false;
    submittedPatchRef.current = null;
  }, [detail.id, drawerGeneration, userId, identityMutations]);

  useEffect(() => {
    if (!snapshot || !draft) return;
    draftDirtyRef.current = !draftsEqualForNoOp(snapshot, draft);
  }, [draft, snapshot]);

  useEffect(() => {
    const profile = detail.globalProfile;
    baselineRef.current = profile;
    if (draftDirtyRef.current || saving || submitAdmittedRef.current) return;
    if (
      identityMutations?.isPendingFor(
        (op) => op.kind === 'profile' && op.userId === userId && op.drawerGeneration === drawerGeneration,
      )
    ) {
      return;
    }
    setSnapshot(profile);
    setDraft(profileDtoToDraft(profile));
  }, [detail.globalProfile, saving, userId, drawerGeneration, identityMutations]);

  const discardDraft = () => {
    if (!snapshot) return;
    setDraft(profileDtoToDraft(snapshot));
    draftDirtyRef.current = false;
    saveOperationKeyRef.current = newIdempotencyKey('ma-global-profile');
    submittedPatchRef.current = null;
  };

  const updateDraft = (patch: Partial<ProfileDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = async () => {
    if (!snapshot || !draft || saving || submitAdmittedRef.current) return;
    const generationAtStart = bindGenerationRef.current;
    if (!isMutationTargetCurrent(userId, generationAtStart)) return;

    if (draftsEqualForNoOp(snapshot, draft)) {
      toast.message(t('master.securityAccess.userDetail.profile.noChanges'));
      return;
    }

    const patchBody = buildChangedProfilePatch(snapshot, draft);
    if (!patchBody) {
      toast.message(t('master.securityAccess.userDetail.profile.noChanges'));
      return;
    }

    if (!submittedPatchRef.current) {
      submittedPatchRef.current = {
        operationKey: saveOperationKeyRef.current,
        patch: {
          ...patchBody,
          idempotencyKey: saveOperationKeyRef.current,
        },
      };
    }

    submitAdmittedRef.current = true;
    setSaving(true);

    const frozenPatch = structuredClone(submittedPatchRef.current!.patch);
    const pendingOp: MasterIdentityProfilePendingOp = {
      kind: 'profile',
      action: MASTER_IDENTITY_STEP_UP_ACTION,
      drawerGeneration: generationAtStart,
      userId,
      operationKey: submittedPatchRef.current!.operationKey,
      patch: frozenPatch,
    };

    const assertStillAdmitted = () =>
      isMutationTargetCurrent(userId, generationAtStart) &&
      bindGenerationRef.current === generationAtStart &&
      saveOperationKeyRef.current === pendingOp.operationKey;

    const onSuccess = async () => {
      if (!assertStillAdmitted()) return;
      const reloaded = await api.admin.securityAccess.getUser(userId);
      if (!assertStillAdmitted()) return;
      const authoritative = reloaded.globalProfile;
      const localOverlay =
        draft && submittedPatchRef.current
          ? Object.fromEntries(
              Object.entries(draft).filter(([key, value]) => {
                const patchKey = key as keyof ProfileDraft;
                if (!(patchKey in frozenPatch)) return true;
                return String(value ?? '') !== String(frozenPatch[patchKey as keyof typeof frozenPatch] ?? '');
              }),
            )
          : {};
      setSnapshot(authoritative);
      const merged = profileDtoToDraft(authoritative);
      setDraft({ ...merged, ...localOverlay });
      draftDirtyRef.current = Object.keys(localOverlay).length > 0;
      baselineRef.current = authoritative;
      saveOperationKeyRef.current = newIdempotencyKey('ma-global-profile');
      submittedPatchRef.current = null;
      toast.success(t('master.securityAccess.userDetail.profile.success'));
      onSaved();
    };

    try {
      if (identityMutations?.runWithStepUp) {
        await identityMutations.runWithStepUp({ op: pendingOp, assertStillAdmitted, onSuccess });
      } else {
        if (!assertStillAdmitted()) throw new Error('IDENTITY_ADMISSION_STALE');
        await executeIdentityPrivilegedMutation(pendingOp);
        if (!assertStillAdmitted()) return;
        await onSuccess();
      }
    } catch (err: unknown) {
      if (!isMutationTargetCurrent(userId, generationAtStart)) return;
      const code = parseHttpErrorCodeFromUnknown(err);
      const status = parseHttpErrorStatusFromUnknown(err);
      if (code === 'OPERATION_IDEMPOTENCY_CONFLICT') {
        toast.error(t('master.securityAccess.userDetail.profile.conflict'));
      } else if (status === 400 || code === 'BAD_REQUEST') {
        saveOperationKeyRef.current = newIdempotencyKey('ma-global-profile');
        submittedPatchRef.current = null;
        toast.error(t('master.securityAccess.userDetail.profile.failed'));
      } else {
        toast.error(t('master.securityAccess.userDetail.profile.failed'));
      }
    } finally {
      if (isMutationTargetCurrent(userId, generationAtStart)) {
        setSaving(false);
        submitAdmittedRef.current = false;
      }
    }
  };

  if (!draft) return null;

  const noOp = snapshot ? draftsEqualForNoOp(snapshot, draft) : true;
  const mutationPending =
    identityMutations?.isPendingFor(
      (op) => op.kind === 'profile' && op.userId === userId && op.drawerGeneration === drawerGeneration,
    ) ?? false;
  const inputsFrozen = saving || mutationPending || Boolean(submittedPatchRef.current);

  return (
    <section data-testid="global-profile-edit">
      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        {t('master.securityAccess.userDetail.section.globalProfile')}
      </h3>
      <p className="mb-2 text-[11px] text-muted-foreground">
        {t('master.securityAccess.userDetail.profile.emailLocked')}
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.firstName')}</span>
          <input
            className={INPUT}
            value={draft.firstName}
            onChange={(e) => updateDraft({ firstName: e.target.value })}
            disabled={inputsFrozen}
            data-testid="profile-first-name"
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.lastName')}</span>
          <input
            className={INPUT}
            value={draft.lastName}
            onChange={(e) => updateDraft({ lastName: e.target.value })}
            disabled={inputsFrozen}
            data-testid="profile-last-name"
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.displayName')}</span>
          <input
            className={INPUT}
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            disabled={inputsFrozen}
            data-testid="profile-display-name"
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.phone')}</span>
          <input
            className={INPUT}
            value={draft.phone}
            onChange={(e) => updateDraft({ phone: e.target.value })}
            disabled={inputsFrozen}
            data-testid="profile-phone"
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.mobile')}</span>
          <input
            className={INPUT}
            value={draft.mobile}
            onChange={(e) => updateDraft({ mobile: e.target.value })}
            disabled={inputsFrozen}
            data-testid="profile-mobile"
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.address')}</span>
          <input
            className={INPUT}
            value={draft.address}
            onChange={(e) => updateDraft({ address: e.target.value })}
            disabled={inputsFrozen}
            data-testid="profile-address"
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.language')}</span>
          <select
            className={INPUT}
            value={draft.language}
            onChange={(e) => updateDraft({ language: e.target.value })}
            disabled={inputsFrozen}
            data-testid="profile-language"
          >
            <option value="">—</option>
            {PROFILE_LOCALE_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.timezone')}</span>
          <select
            className={INPUT}
            value={draft.timezone}
            onChange={(e) => updateDraft({ timezone: e.target.value })}
            disabled={inputsFrozen}
            data-testid="profile-timezone"
          >
            <option value="">—</option>
            {PROFILE_TIMEZONE_OPTIONS.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.dateFormat')}</span>
          <select
            className={INPUT}
            value={draft.dateFormat}
            onChange={(e) => updateDraft({ dateFormat: e.target.value })}
            disabled={inputsFrozen}
            data-testid="profile-date-format"
          >
            <option value="">—</option>
            {PROFILE_DATE_FORMATS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saving || noOp}
          onClick={() => void handleSave()}
          data-testid="profile-save"
        >
          {t('master.securityAccess.userDetail.profile.save')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving || noOp}
          onClick={discardDraft}
          data-testid="profile-discard"
        >
          {t('master.securityAccess.userDetail.profile.discard')}
        </Button>
      </div>
    </section>
  );
}