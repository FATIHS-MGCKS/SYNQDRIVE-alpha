import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';
import { newIdempotencyKey } from '../../../lib/mfa';
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

const INPUT =
  'w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-ring';

export interface GlobalProfileEditPanelProps {
  userId: string;
  detail: GovernanceUserDetailDto;
  drawerGeneration: number;
  onSaved: () => void;
  isMutationTargetCurrent: (userId: string, generationAtStart: number) => boolean;
}

export function GlobalProfileEditPanel({
  userId,
  detail,
  drawerGeneration,
  onSaved,
  isMutationTargetCurrent,
}: GlobalProfileEditPanelProps) {
  const { t } = useSecurityAccessPresentation();
  const bindGenerationRef = useRef(drawerGeneration);
  const saveOperationKeyRef = useRef(newIdempotencyKey('ma-global-profile'));
  const submitAdmittedRef = useRef(false);

  const [snapshot, setSnapshot] = useState<GovernanceGlobalProfileDto | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    bindGenerationRef.current = drawerGeneration;
    saveOperationKeyRef.current = newIdempotencyKey('ma-global-profile');
    const profile = detail.globalProfile;
    setSnapshot(profile);
    setDraft(profileDtoToDraft(profile));
    setSaving(false);
    submitAdmittedRef.current = false;
  }, [detail.id, detail.globalProfile, drawerGeneration]);

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

    submitAdmittedRef.current = true;
    setSaving(true);
    try {
      await api.admin.securityAccess.updateUserProfile(userId, {
        ...patchBody,
        idempotencyKey: saveOperationKeyRef.current,
      });
      if (!isMutationTargetCurrent(userId, generationAtStart)) return;
      toast.success(t('master.securityAccess.userDetail.profile.success'));
      onSaved();
    } catch (err: unknown) {
      if (!isMutationTargetCurrent(userId, generationAtStart)) return;
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (code === 'OPERATION_IDEMPOTENCY_CONFLICT') {
        toast.error(t('master.securityAccess.userDetail.profile.conflict'));
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
            data-testid="profile-first-name"
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.lastName')}</span>
          <input
            className={INPUT}
            value={draft.lastName}
            onChange={(e) => updateDraft({ lastName: e.target.value })}
            data-testid="profile-last-name"
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.displayName')}</span>
          <input
            className={INPUT}
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            data-testid="profile-display-name"
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.phone')}</span>
          <input
            className={INPUT}
            value={draft.phone}
            onChange={(e) => updateDraft({ phone: e.target.value })}
            data-testid="profile-phone"
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.mobile')}</span>
          <input
            className={INPUT}
            value={draft.mobile}
            onChange={(e) => updateDraft({ mobile: e.target.value })}
            data-testid="profile-mobile"
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.address')}</span>
          <input
            className={INPUT}
            value={draft.address}
            onChange={(e) => updateDraft({ address: e.target.value })}
            data-testid="profile-address"
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.language')}</span>
          <select
            className={INPUT}
            value={draft.language}
            onChange={(e) => updateDraft({ language: e.target.value })}
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
      <Button
        type="button"
        size="sm"
        className="mt-3"
        disabled={saving || noOp}
        onClick={() => void handleSave()}
        data-testid="profile-save"
      >
        {t('master.securityAccess.userDetail.profile.save')}
      </Button>
    </section>
  );
}