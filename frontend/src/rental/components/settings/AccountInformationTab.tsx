import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, ErrorState, SkeletonCard } from '../../../components/patterns';
import { useRentalOrg } from '../../RentalContext';
import { AccountHeaderCard } from './account/AccountHeaderCard';
import { AccountHealthCard } from './account/AccountHealthCard';
import { AccountAccessCard } from './account/AccountAccessCard';
import {
  AccountNotificationsSummaryCard,
  AccountSecuritySummaryCard,
} from './account/AccountSecurityCard';
import { AccountProfileSection } from './account/AccountProfileSection';
import { AccountPreferencesSection } from './account/AccountPreferencesSection';
import { AccountNotificationsSection } from './account/AccountNotificationsSection';
import { AccountSessionsSection } from './account/AccountSessionsSection';
import { ChangePasswordDialog } from './account/ChangePasswordDialog';
import { useAccountCenter } from './account/useAccountCenter';
import {
  cloneNotifications,
  isPreferencesDirty,
  isProfileDirty,
  notificationsDirty,
  preferencesFromAccount,
  profileFromAccount,
  validateProfileDraft,
  type AccountSection,
  type NotificationRow,
  type PreferencesDraft,
  type ProfileDraft,
} from './account/account-utils';

const SECTIONS: Array<{ id: AccountSection; label: string }> = [
  { id: 'profile', label: 'Profil' },
  { id: 'preferences', label: 'Arbeitspräferenzen' },
  { id: 'notifications', label: 'Benachrichtigungen' },
  { id: 'security', label: 'Sicherheit & Sitzungen' },
];

interface AccountInformationTabProps {
  onNavigateToUsers?: () => void;
}

export function AccountInformationTab({ onNavigateToUsers }: AccountInformationTabProps) {
  const { orgId } = useRentalOrg();
  const {
    account,
    sessions,
    stations,
    loading,
    loadError,
    sessionsLoading,
    stationsLoading,
    savingProfile,
    savingPreferences,
    savingNotifications,
    changingPassword,
    revokingSessions,
    revokingSessionId,
    loadAccount,
    loadSessions,
    updateProfile,
    updatePreferences,
    updateNotifications,
    changePassword,
    revokeOtherSessions,
    revokeSession,
  } = useAccountCenter(orgId);

  const [activeSection, setActiveSection] = useState<AccountSection>('profile');
  const [profileEditing, setProfileEditing] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [profileValidationError, setProfileValidationError] = useState<string | null>(null);

  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const [preferencesDraft, setPreferencesDraft] = useState<PreferencesDraft | null>(null);
  const [notificationsDraft, setNotificationsDraft] = useState<NotificationRow[] | null>(null);

  const savedProfile = useMemo(
    () => (account ? profileFromAccount(account) : null),
    [account],
  );
  const savedPreferences = useMemo(
    () => (account ? preferencesFromAccount(account) : null),
    [account],
  );
  const savedNotifications = useMemo(
    () => (account ? cloneNotifications(account.notifications) : null),
    [account],
  );

  const effectiveProfile = profileEditing && profileDraft ? profileDraft : savedProfile;
  const effectivePreferences = preferencesDraft ?? savedPreferences;
  const effectiveNotifications = notificationsDraft ?? savedNotifications;

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const profileDirty = useMemo(
    () =>
      profileEditing &&
      savedProfile &&
      profileDraft &&
      isProfileDirty(savedProfile, profileDraft),
    [profileEditing, savedProfile, profileDraft],
  );
  const preferencesDirty = useMemo(
    () =>
      savedPreferences &&
      preferencesDraft &&
      isPreferencesDirty(savedPreferences, preferencesDraft),
    [savedPreferences, preferencesDraft],
  );
  const notificationsDirtyFlag = useMemo(
    () =>
      savedNotifications &&
      notificationsDraft &&
      notificationsDirty(savedNotifications, notificationsDraft),
    [savedNotifications, notificationsDraft],
  );

  const scrollToSection = useCallback((section: AccountSection) => {
    setActiveSection(section);
    requestAnimationFrame(() => {
      document
        .getElementById(`account-section-${section}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const startProfileEdit = () => {
    if (savedProfile) setProfileDraft({ ...savedProfile });
    setProfileEditing(true);
  };

  const handleProfileSave = async () => {
    if (!profileDraft) return;
    const err = validateProfileDraft(profileDraft);
    if (err) {
      setProfileValidationError(err);
      return;
    }
    setProfileValidationError(null);
    try {
      await updateProfile(profileDraft);
      setProfileDraft(null);
      setProfileEditing(false);
    } catch {
      /* toast in hook */
    }
  };

  const handleProfileCancel = () => {
    setProfileDraft(null);
    setProfileValidationError(null);
    setProfileEditing(false);
  };

  if (loading && !account) {
    return (
      <div className="max-w-[1600px] mx-auto space-y-5">
        <SkeletonCard />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard />
      </div>
    );
  }

  if (loadError && !account) {
    return (
      <div className="max-w-[1600px] mx-auto">
        <ErrorState
          title="Account konnte nicht geladen werden"
          error={loadError}
          onRetry={() => void loadAccount()}
          retryLabel="Erneut laden"
        />
      </div>
    );
  }

  if (
    !account ||
    !effectiveProfile ||
    !effectivePreferences ||
    !effectiveNotifications ||
    !savedProfile
  ) {
    return null;
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 animate-fade-up">
      <PageHeader
        title="Kontoinformationen"
      />

      <AccountHeaderCard
        account={account}
        onEditProfile={() => {
          startProfileEdit();
          scrollToSection('profile');
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <AccountHealthCard
          accountHealth={account.accountHealth}
          onImprove={() => scrollToSection('profile')}
        />
        <AccountAccessCard
          membership={account.membership}
          organizationName={account.organization.name}
          onManageUsers={onNavigateToUsers}
        />
        <AccountSecuritySummaryCard
          security={account.security}
          onManage={() => scrollToSection('security')}
        />
        <AccountNotificationsSummaryCard
          notifications={account.notifications}
          onAdjust={() => scrollToSection('notifications')}
        />
      </div>

      <nav className="flex flex-wrap gap-2 sticky top-0 z-10 py-2 bg-background/90 backdrop-blur-sm border-b border-border/40 -mx-1 px-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollToSection(s.id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              activeSection === s.id
                ? 'bg-[var(--brand)] text-[var(--brand-foreground)]'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="space-y-5 pb-8">
        <AccountProfileSection
          account={account}
          editing={profileEditing}
          draft={effectiveProfile}
          saved={savedProfile}
          dirty={Boolean(profileDirty)}
          saving={savingProfile}
          validationError={profileValidationError}
          onDraftChange={(patch) =>
            setProfileDraft((p) => ({ ...(p ?? savedProfile), ...patch }))
          }
          onStartEdit={startProfileEdit}
          onCancel={handleProfileCancel}
          onSave={() => void handleProfileSave()}
        />

        <AccountPreferencesSection
          draft={effectivePreferences}
          saved={savedPreferences!}
          dirty={Boolean(preferencesDirty)}
          saving={savingPreferences}
          stations={stations}
          stationsLoading={stationsLoading}
          onDraftChange={(patch) =>
            setPreferencesDraft((p) => ({ ...(p ?? savedPreferences!), ...patch }))
          }
          onSave={async () => {
            if (!effectivePreferences) return;
            try {
              await updatePreferences(effectivePreferences);
              setPreferencesDraft(null);
            } catch {
              /* toast in hook */
            }
          }}
          onReset={() => setPreferencesDraft(null)}
        />

        <AccountNotificationsSection
          draft={effectiveNotifications}
          dirty={Boolean(notificationsDirtyFlag)}
          saving={savingNotifications}
          onDraftChange={setNotificationsDraft}
          onSave={async () => {
            if (!effectiveNotifications) return;
            try {
              await updateNotifications(effectiveNotifications);
              setNotificationsDraft(null);
            } catch {
              /* toast in hook */
            }
          }}
          onReset={() => setNotificationsDraft(null)}
        />

        <AccountSessionsSection
          account={account}
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          revokingSessions={revokingSessions}
          revokingSessionId={revokingSessionId}
          onChangePassword={() => setShowPasswordDialog(true)}
          onRevokeOthers={() => void revokeOtherSessions()}
          onRevokeSession={(id) => void revokeSession(id)}
          onRefreshSessions={() => void loadSessions()}
        />
      </div>

      <ChangePasswordDialog
        open={showPasswordDialog}
        saving={changingPassword}
        onClose={() => setShowPasswordDialog(false)}
        onSubmit={changePassword}
      />
    </div>
  );
}
