import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';
import type { GovernanceUserDetailDto } from '../types';
import { useSecurityAccessPresentation } from '../useSecurityAccessPresentation';

const INPUT =
  'w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-ring';

export interface GlobalProfileEditPanelProps {
  userId: string;
  detail: GovernanceUserDetailDto;
  onSaved: () => void;
  isTargetCurrent: () => boolean;
}

export function GlobalProfileEditPanel({
  userId,
  detail,
  onSaved,
  isTargetCurrent,
}: GlobalProfileEditPanelProps) {
  const { t } = useSecurityAccessPresentation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState('de');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const parts = detail.name?.split(/\s+/) ?? [];
    setFirstName(parts[0] ?? '');
    setLastName(parts.slice(1).join(' ') ?? '');
    setPhone('');
    setLanguage('de');
  }, [detail.id, detail.name, userId]);

  const handleSave = async () => {
    if (saving || !isTargetCurrent()) return;
    setSaving(true);
    try {
      await api.admin.securityAccess.updateUserProfile(userId, {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        language: language.trim() || undefined,
      });
      if (!isTargetCurrent()) return;
      toast.success(t('master.securityAccess.userDetail.profile.success'));
      onSaved();
    } catch {
      if (!isTargetCurrent()) return;
      toast.error(t('master.securityAccess.userDetail.profile.failed'));
    } finally {
      if (isTargetCurrent()) setSaving(false);
    }
  };

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
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            data-testid="profile-first-name"
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.lastName')}</span>
          <input
            className={INPUT}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            data-testid="profile-last-name"
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.phone')}</span>
          <input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-muted-foreground">{t('master.securityAccess.userDetail.profile.language')}</span>
          <input className={INPUT} value={language} onChange={(e) => setLanguage(e.target.value)} />
        </label>
      </div>
      <Button
        type="button"
        size="sm"
        className="mt-3"
        disabled={saving}
        onClick={() => void handleSave()}
        data-testid="profile-save"
      >
        {t('master.securityAccess.userDetail.profile.save')}
      </Button>
    </section>
  );
}