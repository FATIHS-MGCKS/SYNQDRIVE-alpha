import { Building2, Car, Clock, CreditCard, Database, Globe, Signal, SignalZero, User, UserCog, Wifi, Zap } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useMemo, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';

import { getStoredUser } from '../../lib/auth';
import { useRentalOrg } from '../RentalContext';
import { api, type FleetConnectivityResponse, type FleetConnectivityVehicle } from '../../lib/api';
import { isVehicleAtHomeStation } from '../../lib/geospatial';
import { formatOdometerKmFloor } from '../../lib/formatVehicleDisplay';
import { UsersRolesTab } from './UsersRolesTab';
import { DataAuthorizationTab } from './DataAuthorizationTab';
import { LegalDocumentsTab } from './LegalDocumentsTab';
import {
  PageHeader,
  DataCard,
  MetricCard,
  EmptyState,
  StatusChip,
  SectionHeader,
} from '../../components/patterns';

function useDocumentDark(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const observer = new MutationObserver(onStoreChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

function getInitials(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

interface SettingsViewProps {
  activeTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
}

type SettingsTab = 'account' | 'company' | 'fleet-connection' | 'users' | 'billing' | 'data-authorization' | 'legal-documents';

// ============================================
// ACCOUNT INFORMATION TAB
// ============================================
function AccountInformationTab() {
  const storedUser = getStoredUser();
  const { orgName, userRole, userPermissions } = useRentalOrg();
  const [isEditing, setIsEditing] = useState(false);
  const [accountData, setAccountData] = useState(() => {
    const u = getStoredUser();
    const parts = (u?.name || '').trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';
    return {
      firstName,
      lastName,
      email: u?.email ?? '',
      phone: '',
      mobile: '',
      position: u?.membershipRole ?? u?.platformRole ?? '',
      department: u?.organizationName ?? '',
      location: '',
      language: 'Deutsch',
      timezone: 'Europe/Berlin (CET)',
      dateFormat: 'DD.MM.YYYY',
      notifications: {
        email: true,
        push: true,
        sms: false,
        weeklyReport: true,
        bookingAlerts: true,
        maintenanceAlerts: true,
        fineAlerts: false,
      },
    };
  });
  const accountInitials = getInitials(storedUser?.name ?? null, storedUser?.email ?? '');
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  const cardClass = 'sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]';
  const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs text-foreground placeholder:text-muted-foreground transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70 outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]';
  const labelClass = 'block text-[11px] font-semibold mb-1.5 text-muted-foreground';
  const textPrimary = 'text-foreground';
  const textSecondary = 'text-muted-foreground';

  const toggleNotification = (key: keyof typeof accountData.notifications) => {
    setAccountData({
      ...accountData,
      notifications: { ...accountData.notifications, [key]: !accountData.notifications[key] },
    });
  };

  const accountName = `${accountData.firstName} ${accountData.lastName}`.trim() || storedUser?.email || 'User';
  const roleLabel = userRole || storedUser?.membershipRole || storedUser?.platformRole || 'Member';
  const organizationLabel = orgName || storedUser?.organizationName || accountData.department || 'No organization';
  const permissionCount = useMemo(() => {
    if (!userPermissions) return 0;
    return Object.values(userPermissions).filter((p) => p?.read || p?.write).length;
  }, [userPermissions]);
  const enabledNotifications = Object.values(accountData.notifications).filter(Boolean).length;
  const profileCompleteness = useMemo(() => {
    const fields = [
      accountData.firstName,
      accountData.lastName,
      accountData.email,
      accountData.position,
      accountData.department || organizationLabel,
      accountData.language,
      accountData.timezone,
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [accountData, organizationLabel]);

  const summaryCards = [
    {
      label: 'Profile',
      value: `${profileCompleteness}%`,
      meta: isEditing ? 'Editing draft' : 'Ready',
      icon: 'user',
      tone: profileCompleteness >= 80 ? 'sq-tone-success' : 'sq-tone-warning',
    },
    {
      label: 'Role',
      value: roleLabel,
      meta: organizationLabel,
      icon: 'shield-check',
      tone: 'sq-tone-brand',
    },
    {
      label: 'Access',
      value: permissionCount,
      meta: permissionCount === 1 ? 'permission group' : 'permission groups',
      icon: 'key',
      tone: 'sq-tone-info',
    },
    {
      label: 'Alerts',
      value: enabledNotifications,
      meta: 'enabled channels',
      icon: 'bell',
      tone: 'sq-tone-neutral',
    },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <PageHeader
        title="Account Information"
        description="Verwalten Sie Profil, Sicherheit, Sitzungen und persönliche Benachrichtigungen an einer Stelle."
        actions={
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
              isEditing
                ? 'bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] shadow-[var(--shadow-1)]'
                : 'border border-border/60 bg-card text-foreground hover:bg-muted'
            }`}
          >
            {isEditing ? <><Icon name="save" className="w-4 h-4" /> Änderungen speichern</> : <><Icon name="edit-3" className="w-4 h-4" /> Profil bearbeiten</>}
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            hint={card.meta}
            icon={<Icon name={card.icon} className="w-4 h-4" />}
            status={
              card.tone === 'sq-tone-success' ? 'success'
              : card.tone === 'sq-tone-warning' ? 'warning'
              : card.tone === 'sq-tone-brand' ? 'info'
              : card.tone === 'sq-tone-info' ? 'info'
              : 'neutral'
            }
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Left Column — Profile Card & Security */}
        <div className="space-y-5">
          {/* Profile Card */}
          <div className={cardClass}>
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-3">
                <div className="w-24 h-24 sq-tone-brand rounded-3xl flex items-center justify-center text-[24px] font-semibold tracking-[-0.04em] shadow-[var(--shadow-2)]">
                  {accountInitials}
                </div>
                {isEditing && (
                  <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl flex items-center justify-center text-white shadow-lg bg-[var(--brand)] hover:bg-[var(--brand-hover)] transition-colors">
                    <Icon name="camera" className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="absolute -top-1 -right-1 w-6 h-6 sq-tone-success rounded-xl border-2 border-background flex items-center justify-center">
                  <Icon name="check" className="w-3 h-3" />
                </div>
              </div>
              <h3 className={`text-[16px] font-semibold tracking-[-0.01em] ${textPrimary}`}>{accountName}</h3>
              <p className={`text-[12px] ${textSecondary}`}>{accountData.position || roleLabel}</p>
              <p className={`text-[11px] mt-0.5 ${textSecondary}`}>{organizationLabel}</p>
              <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold sq-tone-brand">
                <Icon name="crown" className="w-3 h-3" /> {roleLabel}
              </div>
            </div>
            <div className={`mt-5 pt-5 border-t space-y-3 ${'border-border/60'}`}>
              <div className="flex items-center gap-3">
                <div className="sq-tone-neutral w-8 h-8 rounded-lg flex items-center justify-center shrink-0"><Icon name="mail" className="w-4 h-4" /></div>
                <span className={`text-xs ${textSecondary}`}>{accountData.email || 'Keine E-Mail hinterlegt'}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="sq-tone-neutral w-8 h-8 rounded-lg flex items-center justify-center shrink-0"><Icon name="phone" className="w-4 h-4" /></div>
                <span className={`text-xs ${textSecondary}`}>{accountData.phone || 'Telefon nicht hinterlegt'}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="sq-tone-neutral w-8 h-8 rounded-lg flex items-center justify-center shrink-0"><Icon name="smartphone" className="w-4 h-4" /></div>
                <span className={`text-xs ${textSecondary}`}>{accountData.mobile || 'Mobilnummer nicht hinterlegt'}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="sq-tone-neutral w-8 h-8 rounded-lg flex items-center justify-center shrink-0"><Icon name="map-pin" className="w-4 h-4" /></div>
                <span className={`text-xs ${textSecondary}`}>{accountData.location || 'Standort nicht gesetzt'}</span>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className={`text-[14px] font-semibold tracking-[-0.01em] ${textPrimary}`}>Sicherheit</h3>
                <p className={`text-[11px] ${textSecondary}`}>Login, 2FA und Sitzungsstatus</p>
              </div>
              <span className="sq-tone-success px-2 py-1 rounded-lg text-[10px] font-semibold">Protected</span>
            </div>
            <div className="space-y-3">
              <div className={`flex items-center justify-between p-3 rounded-xl border ${'bg-muted/40 border-border'}`}>
                <div className="flex items-center gap-3">
                  <div className="sq-tone-neutral w-9 h-9 rounded-xl flex items-center justify-center shrink-0"><Icon name="key" className="w-4 h-4" /></div>
                  <div>
                    <p className={`text-xs font-medium ${textPrimary}`}>Passwort</p>
                    <p className={`text-xs ${textSecondary}`}>Änderung über gesicherten Dialog</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPasswordChange(!showPasswordChange)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    'text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]'
                  }`}
                >
                  Ändern
                </button>
              </div>
              {showPasswordChange && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className={labelClass}>Aktuelles Passwort</label>
                    <input type="password" placeholder="••••••••" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Neues Passwort</label>
                    <input type="password" placeholder="Mindestens 8 Zeichen" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Passwort bestätigen</label>
                    <input type="password" placeholder="Passwort wiederholen" className={inputClass} />
                  </div>
                  <button className="w-full px-3 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors">
                    Passwort aktualisieren
                  </button>
                </div>
              )}
              <div className={`flex items-center justify-between p-3 rounded-xl border ${'bg-muted/40 border-border'}`}>
                <div className="flex items-center gap-3">
                  <div className="sq-tone-success w-9 h-9 rounded-xl flex items-center justify-center shrink-0"><Icon name="shield-check" className="w-4 h-4" /></div>
                  <div>
                    <p className={`text-xs font-medium ${textPrimary}`}>Zwei-Faktor-Authentifizierung</p>
                    <p className={`text-xs ${textSecondary}`}>Zusätzliche Sicherheitsebene</p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg sq-tone-success">Aktiv</span>
              </div>
              <div className={`flex items-center justify-between p-3 rounded-xl border ${'bg-muted/40 border-border'}`}>
                <div className="flex items-center gap-3">
                  <div className="sq-tone-info w-9 h-9 rounded-xl flex items-center justify-center shrink-0"><Icon name="clock" className="w-4 h-4" /></div>
                  <div>
                    <p className={`text-xs font-medium ${textPrimary}`}>Letzte Anmeldung</p>
                    <p className={`text-xs ${textSecondary}`}>Aktuelle Session · Browser</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column — Personal Data & Preferences */}
        <div className="lg:col-span-2 space-y-5">
          {/* Personal Information */}
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className={`text-[14px] font-semibold tracking-[-0.01em] ${textPrimary}`}>Persönliche Informationen</h3>
                <p className={`text-[11px] ${textSecondary}`}>Basisdaten aus Login-Profil und lokalen Einstellungen</p>
              </div>
              <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${isEditing ? 'sq-tone-warning' : 'sq-tone-neutral'}`}>
                {isEditing ? 'Bearbeitung aktiv' : 'Read only'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Vorname</label>
                <input type="text" value={accountData.firstName}
                  onChange={(e) => setAccountData({ ...accountData, firstName: e.target.value })}
                  disabled={!isEditing} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Nachname</label>
                <input type="text" value={accountData.lastName}
                  onChange={(e) => setAccountData({ ...accountData, lastName: e.target.value })}
                  disabled={!isEditing} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>E-Mail-Adresse</label>
                <input type="email" value={accountData.email}
                  onChange={(e) => setAccountData({ ...accountData, email: e.target.value })}
                  disabled={!isEditing} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Telefon</label>
                <input type="text" value={accountData.phone}
                  onChange={(e) => setAccountData({ ...accountData, phone: e.target.value })}
                  disabled={!isEditing} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Mobil</label>
                <input type="text" value={accountData.mobile}
                  onChange={(e) => setAccountData({ ...accountData, mobile: e.target.value })}
                  disabled={!isEditing} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Position</label>
                <input type="text" value={accountData.position}
                  onChange={(e) => setAccountData({ ...accountData, position: e.target.value })}
                  disabled={!isEditing} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Abteilung</label>
                <input type="text" value={accountData.department}
                  onChange={(e) => setAccountData({ ...accountData, department: e.target.value })}
                  disabled={!isEditing} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Standort</label>
                <select value={accountData.location}
                  onChange={(e) => setAccountData({ ...accountData, location: e.target.value })}
                  disabled={!isEditing} className={inputClass}>
                  <option>Berlin Central</option>
                  <option>Berlin Tegel</option>
                  <option>Munich Central</option>
                  <option>Hamburg Hafen</option>
                  <option>Stuttgart Mitte</option>
                  <option>Frankfurt Airport</option>
                </select>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className={`text-[14px] font-semibold tracking-[-0.01em] ${textPrimary}`}>Einstellungen</h3>
                <p className={`text-[11px] ${textSecondary}`}>Sprache, Zeitzone und Datumsformat für operative Ansichten</p>
              </div>
              <span className="sq-tone-neutral px-2 py-1 rounded-lg text-[10px] font-semibold">{accountData.language}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Sprache</label>
                <select value={accountData.language}
                  onChange={(e) => setAccountData({ ...accountData, language: e.target.value })}
                  disabled={!isEditing} className={inputClass}>
                  <option>Deutsch</option>
                  <option>English</option>
                  <option>Français</option>
                  <option>Italiano</option>
                  <option>Polski</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Zeitzone</label>
                <select value={accountData.timezone}
                  onChange={(e) => setAccountData({ ...accountData, timezone: e.target.value })}
                  disabled={!isEditing} className={inputClass}>
                  <option>Europe/Berlin (CET)</option>
                  <option>Europe/London (GMT)</option>
                  <option>Europe/Paris (CET)</option>
                  <option>Europe/Zurich (CET)</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Datumsformat</label>
                <select value={accountData.dateFormat}
                  onChange={(e) => setAccountData({ ...accountData, dateFormat: e.target.value })}
                  disabled={!isEditing} className={inputClass}>
                  <option>DD.MM.YYYY</option>
                  <option>MM/DD/YYYY</option>
                  <option>YYYY-MM-DD</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className={`text-[14px] font-semibold tracking-[-0.01em] ${textPrimary}`}>Benachrichtigungen</h3>
                <p className={`text-[11px] ${textSecondary}`}>{enabledNotifications} Kanäle aktiv</p>
              </div>
              <button
                type="button"
                onClick={() => setAccountData({
                  ...accountData,
                  notifications: Object.fromEntries(
                    Object.keys(accountData.notifications).map((key) => [key, true]),
                  ) as typeof accountData.notifications,
                })}
                className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors text-[var(--brand)] hover:bg-[var(--brand-soft)]"
              >
                Alle aktivieren
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { key: 'email' as const, label: 'E-Mail-Benachrichtigungen', desc: 'Wichtige Updates per E-Mail erhalten' },
                { key: 'push' as const, label: 'Push-Benachrichtigungen', desc: 'Desktop-Benachrichtigungen im Browser' },
                { key: 'sms' as const, label: 'SMS-Benachrichtigungen', desc: 'Kritische Alerts per SMS' },
                { key: 'weeklyReport' as const, label: 'Wöchentlicher Report', desc: 'Zusammenfassung jeden Montag' },
                { key: 'bookingAlerts' as const, label: 'Buchungs-Alerts', desc: 'Neue Buchungen und Stornierungen' },
                { key: 'maintenanceAlerts' as const, label: 'Wartungs-Alerts', desc: 'Anstehende Wartungstermine' },
              ].map((item) => (
                <div key={item.key} className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${'bg-muted/40 border-border'}`}>
                  <div>
                    <p className={`text-xs font-medium ${textPrimary}`}>{item.label}</p>
                    <p className={`text-xs ${textSecondary}`}>{item.desc}</p>
                  </div>
                  <button
                    onClick={() => toggleNotification(item.key)}
                    className={`relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0 ${
                      accountData.notifications[item.key]
                        ? 'bg-[var(--brand)]'
                        : 'bg-muted'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      accountData.notifications[item.key] ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Active Sessions */}
          <div className={cardClass}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className={`text-[14px] font-semibold tracking-[-0.01em] ${textPrimary}`}>Aktive Sitzungen</h3>
                <p className={`text-[11px] ${textSecondary}`}>Gerätezugriffe und aktuelle Session</p>
              </div>
              <button className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors text-red-500 hover:bg-red-50 ${'hover:bg-[color:var(--status-critical-soft)]'}`}>
                Alle anderen abmelden
              </button>
            </div>
            <div className="space-y-2">
              {[
                { device: 'Current browser', location: organizationLabel, time: 'Aktuelle Sitzung', current: true },
              ].map((session, i) => (
                <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${'bg-muted/40 border-border'}`}>
                  <div className="flex items-center gap-3">
                    <div className="sq-tone-info w-9 h-9 rounded-xl flex items-center justify-center shrink-0">
                      <Icon name="globe" className="w-4 h-4" />
                    </div>
                    <div>
                      <p className={`text-xs font-medium ${textPrimary}`}>{session.device}</p>
                      <p className={`text-xs ${textSecondary}`}>{session.location} · {session.time}</p>
                    </div>
                  </div>
                  {session.current ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-lg sq-tone-success">Aktuell</span>
                  ) : (
                    <button className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${'text-muted-foreground hover:bg-muted'}`}>
                      Abmelden
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// COMPANY PROFILE TAB
// ============================================
//
// Backend-backed: GET/PATCH /organizations/:orgId/profile and
// POST /organizations/:orgId/profile/logo (multer). The logo URL also
// flows back into RentalContext so the right-sidebar branding header
// updates immediately after upload (no page reload required).

type CompanyProfileData = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  taxId: string;
  manager: string;
  managerEmail: string;
  email: string;
  phone: string;
  timezone: string;
  language: string;
  website: string;
};

function emptyCompanyProfileData(): CompanyProfileData {
  return {
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    taxId: '',
    manager: '',
    managerEmail: '',
    email: '',
    phone: '',
    timezone: '',
    language: '',
    website: '',
  };
}

function CompanyProfileTab({ orgId }: { orgId?: string }) {
  const { setOrgBranding, hasPermission, userRole } = useRentalOrg();
  const canEditProfile = userRole === 'ORG_ADMIN' || hasPermission('settings', 'write');

  const [companyData, setCompanyData] = useState<CompanyProfileData>(() => emptyCompanyProfileData());
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ kind: 'ok' | 'err'; text?: string } | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBroken, setLogoBroken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLogoBroken(false);
  }, [logoUrl]);

  const loadProfile = useCallback(async () => {
    if (!orgId?.trim()) {
      setLoading(false);
      setLoadError('Keine Organisation geladen.');
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const profile = await api.organizations.getProfile(orgId);
      setCompanyData({
        name: profile.companyName ?? '',
        address: profile.address ?? '',
        city: profile.city ?? '',
        state: profile.state ?? '',
        zip: profile.zip ?? '',
        country: profile.country ?? '',
        taxId: profile.taxId ?? '',
        manager: profile.managerName ?? '',
        managerEmail: profile.managerEmail ?? '',
        email: profile.email ?? '',
        phone: profile.phone ?? '',
        timezone: profile.timezone ?? '',
        language: profile.language ?? '',
        website: profile.website ?? '',
      });
      setLogoUrl(profile.logoUrl ?? null);
      setOrgBranding({
        orgName: profile.companyName ?? '',
        orgLogoUrl: profile.logoUrl ?? null,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Profil konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [orgId, setOrgBranding]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const persistCompanyProfile = async (): Promise<boolean> => {
    if (!orgId?.trim()) {
      setSaveMessage({ kind: 'err', text: 'Keine Organisation geladen — Profil kann nicht gespeichert werden.' });
      return false;
    }
    setSaving(true);
    try {
      const updated = await api.organizations.updateProfile(orgId, {
        companyName: companyData.name.trim(),
        address: companyData.address,
        city: companyData.city,
        state: companyData.state,
        zip: companyData.zip,
        country: companyData.country,
        taxId: companyData.taxId,
        phone: companyData.phone,
        email: companyData.email,
        website: companyData.website,
        timezone: companyData.timezone,
        language: companyData.language,
        managerName: companyData.manager,
        managerEmail: companyData.managerEmail,
      });
      setOrgBranding({
        orgName: updated?.companyName ?? companyData.name.trim(),
      });
      setSaveMessage({ kind: 'ok' });
      return true;
    } catch (err) {
      setSaveMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Speichern fehlgeschlagen.',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (!canEditProfile) return;
    setSaveMessage(null);
    if (isEditing) {
      if (await persistCompanyProfile()) setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  };

  const handleLogoFile = async (file: File) => {
    if (!orgId?.trim()) {
      setLogoError('Keine Organisation geladen.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setLogoError('Nur Bilddateien sind erlaubt (PNG, JPG, SVG, WebP).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('Datei zu groß (max. 2 MB).');
      return;
    }
    setLogoError(null);
    setLogoUploading(true);
    try {
      const { url } = await api.organizations.uploadLogo(orgId, file);
      setLogoUrl(url);
      setOrgBranding({ orgLogoUrl: url });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.');
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogoRemove = async () => {
    if (!orgId?.trim()) return;
    setLogoError(null);
    setLogoUploading(true);
    try {
      await api.organizations.updateProfile(orgId, { logoUrl: null });
      setLogoUrl(null);
      setOrgBranding({ orgLogoUrl: null });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Logo konnte nicht entfernt werden.');
    } finally {
      setLogoUploading(false);
    }
  };

  const placeholder = '\u2014';

  const cardClass = 'sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]';
  const inputClass = `w-full px-3 py-2.5 rounded-xl border text-xs transition-all duration-200 ${
    'border-border/70 bg-card text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]'
  } outline-none`;
  const inputClassView = `${inputClass} ${!isEditing ? 'cursor-default opacity-90' : ''}`;
  const labelClass = 'block text-[11px] font-semibold mb-1.5 text-muted-foreground';
  const textPrimary = 'text-foreground';
  const textSecondary = 'text-muted-foreground';

  const businessDocuments: Array<{ name: string; size: string; date: string }> = [];

  const profileCompleteness = useMemo(() => {
    const fields = [
      companyData.name,
      companyData.address,
      companyData.city,
      companyData.country,
      companyData.email,
      companyData.phone,
      companyData.manager,
      companyData.managerEmail,
      companyData.timezone,
      companyData.language,
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [companyData]);
  const addressLine = [companyData.zip, companyData.city, companyData.country].filter(Boolean).join(' · ') || 'No address data';
  const contactReady = Boolean(companyData.email || companyData.phone || companyData.website);
  const localizationReady = Boolean(companyData.timezone || companyData.language);
  const summaryCards = [
    {
      label: 'Profile',
      value: `${profileCompleteness}%`,
      meta: profileCompleteness >= 80 ? 'Complete' : 'Needs details',
      icon: 'building-2',
      tone: profileCompleteness >= 80 ? 'sq-tone-success' : 'sq-tone-warning',
    },
    {
      label: 'Branding',
      value: logoUrl ? 'Logo' : 'Missing',
      meta: logoUrl ? 'Shown in app chrome' : 'Upload recommended',
      icon: 'image',
      tone: logoUrl ? 'sq-tone-success' : 'sq-tone-neutral',
    },
    {
      label: 'Contact',
      value: contactReady ? 'Ready' : 'Open',
      meta: companyData.email || companyData.phone || 'No contact channel',
      icon: 'mail',
      tone: contactReady ? 'sq-tone-info' : 'sq-tone-warning',
    },
    {
      label: 'Locale',
      value: localizationReady ? 'Set' : 'Open',
      meta: companyData.timezone || companyData.language || 'Timezone missing',
      icon: 'globe',
      tone: localizationReady ? 'sq-tone-brand' : 'sq-tone-neutral',
    },
  ];

  const primaryButtonDisabled =
    !canEditProfile || saving || (!isEditing && loading) || (!orgId?.trim());
  const primaryButtonLabel = saving
    ? 'Speichern…'
    : isEditing
      ? 'Save Changes'
      : 'Edit Profile';
  const primaryButtonIcon = saving ? (
    <Icon name="loader-2" className="w-5 h-5 animate-spin" />
  ) : isEditing ? (
    <Icon name="save" className="w-5 h-5" />
  ) : (
    <Icon name="edit-3" className="w-5 h-5" />
  );

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="min-h-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.018em] text-foreground">Company Profile</h2>
          <p className="text-[13px] mt-1 text-muted-foreground">
            Verwalten Sie Unternehmensdaten, Branding und Buchungsdokumente mit dem bestehenden Organisationsprofil.
          </p>
          {loading && (
            <p className={`text-xs mt-1 ${textSecondary} flex items-center gap-1.5`}>
              <Icon name="loader-2" className="w-3 h-3 animate-spin" /> Profil wird geladen…
            </p>
          )}
          {!loading && loadError && (
            <p className="text-xs mt-1 text-red-500">{loadError}</p>
          )}
          {saveMessage?.kind === 'ok' && (
            <p className="text-xs mt-1 text-emerald-500">Gespeichert.</p>
          )}
          {saveMessage?.kind === 'err' && (
            <p className="text-xs mt-1 text-red-500">
              {saveMessage.text ?? 'Speichern fehlgeschlagen.'}
            </p>
          )}
          {!loading && !canEditProfile && (
            <p className={`text-xs mt-1 ${textSecondary}`}>
              Nur Organisations-Admins können das Firmenprofil bearbeiten.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={primaryButtonDisabled}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] ${
            primaryButtonDisabled ? 'opacity-50 cursor-not-allowed ' : ''
          }${
            isEditing
              ? 'bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] shadow-[var(--shadow-1)]'
              : 'sq-btn-secondary'
          }`}
        >
          {primaryButtonIcon} {primaryButtonLabel}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <div key={card.label} className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{card.label}</p>
                <p className="mt-2 text-[20px] leading-none font-semibold tracking-[-0.02em] text-foreground tabular-nums truncate">
                  {card.value}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground truncate">{card.meta}</p>
              </div>
              <div className={`${card.tone} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
                <Icon name={card.icon} className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Company Information */}
        <div className={`lg:col-span-2 ${cardClass}`}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className={`text-[14px] font-semibold tracking-[-0.01em] ${textPrimary}`}>Unternehmensinformationen</h3>
              <p className={`text-[11px] mt-0.5 ${textSecondary}`}>{addressLine}</p>
            </div>
            <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${isEditing ? 'sq-tone-warning' : 'sq-tone-neutral'}`}>
              {isEditing ? 'Bearbeitung aktiv' : 'Read only'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelClass}>Firmenname</label>
              <input
                type="text"
                value={companyData.name}
                placeholder={placeholder}
                onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                readOnly={!isEditing}
                className={inputClassView}
              />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Adresse</label>
              <input
                type="text"
                value={companyData.address}
                placeholder={placeholder}
                onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
                readOnly={!isEditing}
                className={inputClassView}
              />
            </div>
            <div>
              <label className={labelClass}>Stadt</label>
              <input
                type="text"
                value={companyData.city}
                placeholder={placeholder}
                onChange={(e) => setCompanyData({ ...companyData, city: e.target.value })}
                readOnly={!isEditing}
                className={inputClassView}
              />
            </div>
            <div>
              <label className={labelClass}>Bundesland</label>
              <input
                type="text"
                value={companyData.state}
                placeholder={placeholder}
                onChange={(e) => setCompanyData({ ...companyData, state: e.target.value })}
                readOnly={!isEditing}
                className={inputClassView}
              />
            </div>
            <div>
              <label className={labelClass}>PLZ</label>
              <input
                type="text"
                value={companyData.zip}
                placeholder={placeholder}
                onChange={(e) => setCompanyData({ ...companyData, zip: e.target.value })}
                readOnly={!isEditing}
                className={inputClassView}
              />
            </div>
            <div>
              <label className={labelClass}>Land</label>
              <input
                type="text"
                value={companyData.country}
                placeholder={placeholder}
                onChange={(e) => setCompanyData({ ...companyData, country: e.target.value })}
                readOnly={!isEditing}
                className={inputClassView}
              />
            </div>
            <div>
              <label className={labelClass}>Steuernummer / USt-ID</label>
              <input
                type="text"
                value={companyData.taxId}
                placeholder={placeholder}
                onChange={(e) => setCompanyData({ ...companyData, taxId: e.target.value })}
                readOnly={!isEditing}
                className={inputClassView}
              />
            </div>
            <div>
              <label className={labelClass}>Telefon</label>
              <input
                type="text"
                value={companyData.phone}
                placeholder={placeholder}
                onChange={(e) => setCompanyData({ ...companyData, phone: e.target.value })}
                readOnly={!isEditing}
                className={inputClassView}
              />
            </div>
            <div>
              <label className={labelClass}>E-Mail</label>
              <input
                type="email"
                value={companyData.email}
                placeholder={placeholder}
                onChange={(e) => setCompanyData({ ...companyData, email: e.target.value })}
                readOnly={!isEditing}
                className={inputClassView}
              />
            </div>
            <div>
              <label className={labelClass}>Website</label>
              <input
                type="text"
                value={companyData.website}
                placeholder={placeholder}
                onChange={(e) => setCompanyData({ ...companyData, website: e.target.value })}
                readOnly={!isEditing}
                className={inputClassView}
              />
            </div>
            <div>
              <label className={labelClass}>Zeitzone</label>
              <input
                type="text"
                value={companyData.timezone}
                placeholder={placeholder}
                onChange={(e) => setCompanyData({ ...companyData, timezone: e.target.value })}
                readOnly={!isEditing}
                className={inputClassView}
              />
            </div>
            <div>
              <label className={labelClass}>Hauptsprache</label>
              <input
                type="text"
                value={companyData.language}
                placeholder={placeholder}
                onChange={(e) => setCompanyData({ ...companyData, language: e.target.value })}
                readOnly={!isEditing}
                className={inputClassView}
              />
            </div>
          </div>

          {/* Manager Section */}
          <div className={`mt-6 pt-6 border-t ${'border-border/60'}`}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className={`text-[13px] font-semibold ${textPrimary}`}>Geschäftsführer / Ansprechpartner</h4>
                <p className={`text-[11px] ${textSecondary}`}>Kontaktperson für Vertrags- und Betriebsfragen</p>
              </div>
              <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${companyData.manager || companyData.managerEmail ? 'sq-tone-success' : 'sq-tone-neutral'}`}>
                {companyData.manager || companyData.managerEmail ? 'Hinterlegt' : 'Offen'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  type="text"
                  value={companyData.manager}
                  placeholder={placeholder}
                  onChange={(e) => setCompanyData({ ...companyData, manager: e.target.value })}
                  readOnly={!isEditing}
                  className={inputClassView}
                />
              </div>
              <div>
                <label className={labelClass}>E-Mail</label>
                <input
                  type="email"
                  value={companyData.managerEmail}
                  placeholder={placeholder}
                  onChange={(e) => setCompanyData({ ...companyData, managerEmail: e.target.value })}
                  readOnly={!isEditing}
                  className={inputClassView}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Logo & Documents */}
        <div className="space-y-5">
          {/* Company Logo — used by the right-sidebar branding header. */}
          <div className={cardClass}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className={`text-[14px] font-semibold tracking-[-0.01em] ${textPrimary}`}>Firmenlogo</h3>
                <p className={`text-[11px] ${textSecondary}`}>Wird in Sidebar und App-Chrome angezeigt</p>
              </div>
              {logoUrl && canEditProfile && (
                <button
                  type="button"
                  onClick={handleLogoRemove}
                  disabled={logoUploading}
                  className={`p-1.5 rounded-lg transition-colors ${
                    logoUploading
                      ? 'opacity-50 cursor-not-allowed'
                      : 'text-muted-foreground hover:text-[color:var(--status-critical)] hover:bg-[color:var(--status-critical-soft)]'
                  }`}
                  title="Logo entfernen"
                  aria-label="Logo entfernen"
                >
                  <Icon name="trash-2" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleLogoFile(file);
              }}
            />

            <div
              className={`border rounded-2xl p-5 text-center transition-colors ${
                'border-border bg-muted/40'
              }`}
            >
              <div
                className="w-24 h-24 mx-auto mb-3 rounded-2xl sq-tone-neutral flex items-center justify-center overflow-hidden"
              >
                {logoUrl && !logoBroken ? (
                  <img
                    src={logoUrl}
                    alt="Firmenlogo"
                    className="w-full h-full object-contain"
                    onError={() => setLogoBroken(true)}
                  />
                ) : (
                  <Icon name="image" className={`w-5 h-5 ${textSecondary}`} />
                )}
              </div>
              <p className={`text-[13px] font-semibold mb-1 ${textPrimary}`}>
                {logoUrl ? 'Logo aktualisieren' : 'Logo hochladen'}
              </p>
              <p className={`text-xs ${textSecondary}`}>PNG, JPG, SVG oder WebP bis 2 MB</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canEditProfile || logoUploading || !orgId?.trim()}
                className={`mt-3 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors active:scale-[0.98] ${
                  !canEditProfile || logoUploading || !orgId?.trim()
                    ? 'opacity-50 cursor-not-allowed bg-[var(--brand)] text-[var(--brand-foreground)]'
                    : 'bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]'
                }`}
              >
                {logoUploading ? (
                  <>
                    <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> Lädt hoch…
                  </>
                ) : (
                  <>
                    <Icon name="upload" className="w-3.5 h-3.5" /> Datei auswählen
                  </>
                )}
              </button>
              {logoError && (
                <p className="text-xs mt-2 text-red-500">{logoError}</p>
              )}
              {!canEditProfile && !logoUrl && (
                <p className={`text-xs mt-2 ${textSecondary}`}>
                  Kein Logo hinterlegt. Nur Admins können ein Logo hochladen.
                </p>
              )}
            </div>
          </div>

          {/* Business Documents */}
          <div className={cardClass}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className={`text-[14px] font-semibold tracking-[-0.01em] ${textPrimary}`}>Dokumente</h3>
                <p className={`text-[11px] ${textSecondary}`}>Buchungsbestätigung und Kundenunterlagen</p>
              </div>
              <button
                type="button"
                disabled
                title="Dokument-Upload ist noch nicht angebunden"
                className="p-1.5 rounded-lg bg-[var(--brand-soft)] text-[var(--brand)] opacity-60 cursor-not-allowed"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className={`text-xs mb-3 ${textSecondary}`}>Geschäftsdokumente, die Kunden bei der Buchungsbestätigung angezeigt werden.</p>
            {businessDocuments.length === 0 ? (
              <div className={`text-xs py-6 text-center rounded-2xl border border-dashed ${
                'border-border text-muted-foreground bg-muted/40'
              }`}>
                <div className="sq-tone-neutral w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center">
                  <Icon name="file-text" className="w-5 h-5" />
                </div>
                <p className="font-semibold text-foreground">Noch keine Dokumente hinterlegt</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Der Upload wird aktiviert, sobald ein Dokumenten-Endpoint vorhanden ist.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {businessDocuments.map((doc, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${
                    'bg-muted/50 border-border'
                  }`}>
                    <Icon name="file-text" className={`w-5 h-5 flex-shrink-0 ${'text-[color:var(--brand)]'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${textPrimary}`}>{doc.name}</p>
                      <p className={`text-xs ${textSecondary}`}>{doc.size} · {doc.date}</p>
                    </div>
                    <button type="button" className={`p-1 rounded-lg hover:bg-red-100 hover:text-red-500 transition-colors ${textSecondary}`}>
                      <Icon name="trash-2" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// FLEET CONNECTION TAB
// ============================================

function ConnectivityStatusChip({ status }: { status: FleetConnectivityVehicle['connectionStatus'] }) {
  const tone =
    status === 'online' ? 'success'
    : status === 'standby' ? 'watch'
    : status === 'offline' ? 'critical'
    : 'noData';
  const label =
    status === 'online' ? 'Online'
    : status === 'standby' ? 'Standby'
    : status === 'offline' ? 'Offline'
    : 'Not Connected';
  return <StatusChip tone={tone} dot={status === 'online'}>{label}</StatusChip>;
}

function FleetConnectionTab() {
  const { orgId } = useRentalOrg();
  const [data, setData] = useState<FleetConnectivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'standby' | 'offline' | 'not_connected'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [jammingOpenId, setJammingOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    setError(false);
    api.vehicles.fleetConnectivity(orgId)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [orgId]);

  const cardClass = 'sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]';
  const textPrimary = 'text-foreground';
  const textSecondary = 'text-muted-foreground';
  const textMuted = 'text-muted-foreground';

  const vehicles = useMemo(() => {
    if (!data) return [];
    let list = data.vehicles;
    if (statusFilter !== 'all') list = list.filter(v => v.connectionStatus === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(v =>
        v.vin?.toLowerCase().includes(q) ||
        v.licensePlate?.toLowerCase().includes(q) ||
        `${v.make} ${v.model}`.toLowerCase().includes(q) ||
        v.deviceSerial?.toLowerCase().includes(q) ||
        v.station?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, statusFilter, search]);

  const s = data?.summary;
  const statusOptions: { key: typeof statusFilter; label: string; description: string }[] = [
    { key: 'all', label: 'All vehicles', description: 'Every registered vehicle' },
    { key: 'online', label: 'Online', description: 'Fresh signal and active data source' },
    { key: 'standby', label: 'Standby', description: 'Known vehicle with stale or paused signal' },
    { key: 'offline', label: 'Offline', description: 'No fresh connection currently available' },
    { key: 'not_connected', label: 'No connection', description: 'Registered but not mapped to a data source' },
  ];
  const statusCount = (key: typeof statusFilter) => {
    if (!s) return 0;
    if (key === 'all') return s.total ?? 0;
    if (key === 'online') return s.online ?? 0;
    if (key === 'standby') return s.standby ?? 0;
    if (key === 'offline') return s.offline ?? 0;
    return s.notConnected ?? 0;
  };
  const activeStatus = statusOptions.find(o => o.key === statusFilter) ?? statusOptions[0];
  const hasActiveFilters = statusFilter !== 'all' || search.trim().length > 0;
  const clearFilters = () => {
    setStatusFilter('all');
    setSearch('');
  };
  const summaryCards = [
    { label: 'Total Vehicles', value: s?.total ?? 0, filter: 'all' as const, icon: Car, tone: 'sq-tone-neutral', meta: `${vehicles.length} currently shown` },
    { label: 'Online', value: s?.online ?? 0, filter: 'online' as const, icon: Signal, tone: 'sq-tone-success', meta: 'Fresh operational feed' },
    { label: 'Standby', value: s?.standby ?? 0, filter: 'standby' as const, icon: Clock, tone: 'sq-tone-warning', meta: 'Needs attention soon' },
    { label: 'Offline', value: s?.offline ?? 0, filter: 'offline' as const, icon: SignalZero, tone: 'sq-tone-critical', meta: `${s?.notConnected ?? 0} not connected` },
    { label: 'No Connection', value: s?.notConnected ?? 0, filter: 'not_connected' as const, icon: Wifi, tone: 'sq-tone-neutral', meta: 'Missing source mapping' },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className={`w-8 h-8 border-2 border-t-transparent rounded-full animate-spin ${'border-[color:var(--brand)]'}`} />
        <p className={`text-xs mt-3 ${textSecondary}`}>Loading fleet connectivity...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Icon name="alert-circle" className={`w-10 h-10 mb-3 ${'text-[color:var(--status-critical)]'}`} />
        <p className={`text-sm font-semibold ${textPrimary}`}>Could not load connectivity data</p>
        <p className={`text-xs mt-1 ${textSecondary}`}>Check your connection or try again later.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <PageHeader
        title="Fleet Connectivity"
        description="Vehicle connection status, data sources, OBD mapping and device signal quality in one operational view."
        status={
          <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${
            (s?.offline ?? 0) > 0 || (s?.notConnected ?? 0) > 0 ? 'sq-tone-warning' : 'sq-tone-success'
          }`}>
            <Icon name={(s?.offline ?? 0) > 0 || (s?.notConnected ?? 0) > 0 ? 'alert-triangle' : 'check-circle-2'} className="w-4 h-4" />
            {(s?.offline ?? 0) > 0 || (s?.notConnected ?? 0) > 0 ? 'Action needed' : 'Fleet connected'}
          </span>
        }
      />

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {summaryCards.map(stat => {
          const active = statusFilter === stat.filter;
          return (
            <button
              type="button"
              key={stat.label}
              onClick={() => setStatusFilter(stat.filter)}
              aria-pressed={active}
              className={`${cardClass} text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] active:scale-[0.99] ${
                active ? 'ring-1 ring-[var(--brand)]' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 text-[22px] leading-none font-semibold tracking-[-0.02em] text-foreground tabular-nums">{stat.value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground truncate">{stat.meta}</p>
                </div>
                <div className={`${stat.tone} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Search & Filters</p>
            <p className="text-[11px] text-muted-foreground">
              Showing {vehicles.length} of {s?.total ?? 0} vehicles · active scope: {activeStatus.label}
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors text-[var(--brand)] hover:bg-[var(--brand-soft)]"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-3">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search VIN, plate, make, model, serial..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-xs border border-border/70 bg-card text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs font-semibold text-foreground outline-none transition-all focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
          >
            {statusOptions.map(option => (
              <option key={option.key} value={option.key}>
                {option.label} ({statusCount(option.key)})
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold sq-tone-neutral">
            <Icon name="filter" className="w-3 h-3" />
            {activeStatus.description}
          </span>
          {search.trim() && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold sq-tone-info">
              Search: {search.trim()}
            </span>
          )}
        </div>
      </div>

      {/* Vehicle List */}
      {vehicles.length === 0 ? (
        <div className={`${cardClass} flex flex-col items-center justify-center py-14 px-6 text-center border-dashed ${
          '!border-border/80'
        }`}>
          <div className="sq-tone-neutral w-12 h-12 rounded-2xl mb-3 flex items-center justify-center">
            <Icon name="car" className="w-6 h-6" />
          </div>
          <p className={`text-sm font-semibold ${textPrimary}`}>
            {search || statusFilter !== 'all' ? 'No vehicles match your filters' : 'No connected vehicles'}
          </p>
          <p className={`text-xs mt-1 max-w-sm ${textSecondary}`}>
            {search || statusFilter !== 'all'
              ? 'Try adjusting your search or filter criteria.'
              : 'Vehicles will appear here once they are registered and connected via DIMO.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {vehicles.map(v => {
            const isExpanded = expandedId === v.vehicleId;
            const ConnIcon = v.connectionType === 'Aftermarket Device' ? Wifi : v.connectionType === 'Synthetic Device' ? Globe : Zap;
            const statusTone =
              v.connectionStatus === 'online' ? 'sq-tone-success'
              : v.connectionStatus === 'standby' ? 'sq-tone-warning'
              : v.connectionStatus === 'offline' ? 'sq-tone-critical'
              : 'sq-tone-neutral';
            return (
              <div key={v.vehicleId} className={`${cardClass} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] cursor-pointer`} onClick={() => setExpandedId(isExpanded ? null : v.vehicleId)}>
                {/* Compact row */}
                <div className="flex items-center gap-3">
                  <div className={`${statusTone} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
                    <ConnIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-semibold truncate ${textPrimary}`}>{v.make} {v.model} {v.year ?? ''}</p>
                      {v.licensePlate && <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-lg sq-tone-neutral">{v.licensePlate}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className={`text-[10px] font-mono ${textMuted}`}>{v.vin}</span>
                      {v.station && <span className={`text-[10px] ${textMuted}`}>{v.station}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className={`text-[10px] ${textMuted}`}>Last Signal</p>
                      <p className={`text-xs font-medium ${
                        v.freshnessLabel === 'Live' ? ('text-[color:var(--status-positive)]')
                        : v.freshnessLabel === 'Unknown' ? textMuted
                        : textPrimary
                      }`}>{v.freshnessLabel}</p>
                    </div>
                    <ConnectivityStatusChip status={v.connectionStatus} />
                    <Icon name="chevron-down" className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''} ${textMuted}`} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className={`mt-4 pt-4 border-t ${'border-border/50'}`} onClick={e => e.stopPropagation()}>
                    {/* Status Interpretation */}
                    <div className={`flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg text-xs ${
                      v.connectionStatus === 'online' ? ('sq-tone-success')
                      : v.connectionStatus === 'standby' ? ('sq-tone-watch')
                      : v.connectionStatus === 'offline' ? ('sq-tone-critical')
                      : ('sq-tone-neutral')
                    }`}>
                      <ConnectivityStatusChip status={v.connectionStatus} />
                      <span className="mt-0.5">{v.statusNote}</span>
                    </div>

                    <div className={`mb-4 rounded-xl border px-3 py-3 space-y-3 ${'border-border/60 bg-muted/50'}`}>
                      <p className={`text-[10px] uppercase tracking-wider font-bold ${textMuted}`}>OBD & cellular</p>
                      <div className="flex items-center gap-2">
                        {v.obdIsPluggedIn === true && <><Icon name="check-circle-2" className="w-4 h-4 text-emerald-500 shrink-0" /><span className={`text-xs font-medium ${textPrimary}`}>OBD Device Plugged IN</span></>}
                        {v.obdIsPluggedIn === false && <><Icon name="x-circle" className="w-4 h-4 text-red-500 shrink-0" /><span className={`text-xs font-medium ${textPrimary}`}>OBD Device Plugged IN</span></>}
                        {v.obdIsPluggedIn == null && <span className={`text-xs ${textMuted}`}>OBD plug-in: no snapshot data</span>}
                      </div>
                      <div>
                        <button
                          type="button"
                          className={`flex items-center gap-2 text-left w-full ${(v.jammingDetectedCount ?? 0) > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if ((v.jammingDetectedCount ?? 0) <= 0) return;
                            setJammingOpenId(jammingOpenId === v.vehicleId ? null : v.vehicleId);
                          }}
                        >
                          <span className={`text-xs font-semibold ${textPrimary}`}>{v.jammingDetectedCount ?? 0} Jamming detected</span>
                          {(v.jammingDetectedCount ?? 0) > 0 && (
                            <Icon name="chevron-down" className={`w-3.5 h-3.5 ${textMuted} transition-transform ${jammingOpenId === v.vehicleId ? 'rotate-180' : ''}`} />
                          )}
                        </button>
                        {jammingOpenId === v.vehicleId && (v.jammingDetectedCount ?? 0) > 0 && (
                          <ul className={`mt-2 space-y-2 pl-3 border-l-2 ${'border-[color:var(--status-watch-soft)]'}`}>
                            {(v.jammingIncidents ?? []).map((inc, i) => (
                              <li key={i} className={`text-[10px] space-y-0.5 ${textSecondary}`}>
                                <p><span className={textMuted}>When: </span>{inc.detectedAt ? new Date(inc.detectedAt).toLocaleString('de-DE') : '—'}</p>
                                <p><span className={textMuted}>Where: </span>{inc.where ?? '—'}</p>
                                <p><span className={textMuted}>Last known address: </span>{inc.lastKnownAddress ?? '—'}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                      {([
                        ['Connection Type', v.connectionType],
                        ['Source Type', v.sourceType ?? '—'],
                        ['Provider', v.provider],
                        ['Device Serial', v.deviceSerial ? <span className="font-mono">{v.deviceSerial}</span> : '—'],
                        ['DIMO Token ID', v.dimoTokenId != null ? <span className="font-mono">{v.dimoTokenId}</span> : '—'],
                        ['Synthetic Token', v.syntheticTokenId != null ? <span className="font-mono">{v.syntheticTokenId}</span> : '—'],
                        ['Last Signal', v.lastSeenAt ? new Date(v.lastSeenAt).toLocaleString('de-DE') : '—'],
                        ['Last Sync', v.lastSyncedAt ? new Date(v.lastSyncedAt).toLocaleString('de-DE') : '—'],
                        ['Data Freshness', v.freshnessLabel],
                        ['Paired / Linked', v.pairedAt ? new Date(v.pairedAt).toLocaleDateString('de-DE') : '—'],
                        ['Telemetry Available', v.hasTelemetry ? 'Yes' : 'No'],
                        ['Odometer', formatOdometerKmFloor(v.odometerKm)],
                        ['Location', (v.latitude != null && v.longitude != null) ? `${v.latitude.toFixed(4)}, ${v.longitude.toFixed(4)}` : '—'],
                        ['VIN', <span className="font-mono text-[10px]">{v.vin}</span>],
                        ['License Plate', v.licensePlate ?? '—'],
                      ] as [string, React.ReactNode][]).map(([label, value]) => (
                        <div key={label}>
                          <p className={`text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>{label}</p>
                          <p className={`text-xs font-medium mt-0.5 ${textPrimary}`}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// STATIONS & BRANCHES TAB — fully live-wired
// ============================================
// Reads from GET /organizations/:orgId/stations (and /stats), supports
// add/edit/delete/activate-deactivate, Google Places autocomplete, and
// shows aggregate vehicle counts. Tenant-scoped via useRentalOrg.
// ============================================
// Geofence sliders are clamped to this range. Values outside get rejected
// by the backend (`stations.service.ts > buildWriteData`) too — keep these
// in sync with `RADIUS_MIN_M` / `RADIUS_MAX_M` there.
const STATION_RADIUS_MIN_M = 25;
const STATION_RADIUS_MAX_M = 5000;
const STATION_RADIUS_DEFAULT_M = 150;

type StationFormState = {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  phone: string;
  email: string;
  managerName: string;
  openingHours: string;
  notes: string;
  googlePlaceId: string | null;
  status: 'ACTIVE' | 'INACTIVE';
};

const EMPTY_STATION_FORM: StationFormState = {
  name: '',
  address: '',
  city: '',
  postalCode: '',
  country: '',
  latitude: null,
  longitude: null,
  radiusMeters: STATION_RADIUS_DEFAULT_M,
  phone: '',
  email: '',
  managerName: '',
  openingHours: '',
  notes: '',
  googlePlaceId: null,
  status: 'ACTIVE',
};

export function StationsTab() {
  const { orgId } = useRentalOrg();

  const [stations, setStations] = useState<import('../../lib/api').Station[]>([]);
  const [stats, setStats] = useState<import('../../lib/api').StationsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stationScope, setStationScope] = useState<'all' | 'active' | 'assigned' | 'setup'>('all');

  // Modal state (create or edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StationFormState>(EMPTY_STATION_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Status toggle feedback
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Vehicle assignment modal — SET-semantics editor for the vehicle ↔ station
  // mapping. We load all vehicles in the org once when the modal opens, then
  // post the resulting set back via api.stations.setVehicles(...).
  type AssignVehicleRow = {
    id: string;
    license: string;
    make: string;
    model: string;
    year: number | null;
    imageUrl: string | null;
    stationId: string | null;
    stationName: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  const [assignStation, setAssignStation] = useState<import('../../lib/api').Station | null>(null);
  const [assignVehicles, setAssignVehicles] = useState<AssignVehicleRow[]>([]);
  const [assignSelected, setAssignSelected] = useState<Set<string>>(new Set());
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignFilter, setAssignFilter] = useState<'all' | 'unassigned' | 'this' | 'other'>('all');

  // Place autocomplete
  const [suggestions, setSuggestions] = useState<import('../../lib/api').StationPlaceSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const suggestTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // V4.7.07 — One-shot Mapbox geocoding backfill state. Surfaced in the page
  // header as "Koordinaten nachziehen" whenever at least one station in the
  // org is missing latitude/longitude (= would render a UNKNOWN HOME/AWAY
  // pill on Dashboard / FleetView). Result banner stays visible until the
  // user dismisses it or runs the backfill again.
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] =
    useState<import('../../lib/api').StationGeocodingBackfillResult | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  // ─────────────────────────── styling ───────────────────────────
  const cardClass = 'sq-card rounded-xl p-4 shadow-[var(--shadow-1)]';
  const textPrimary = 'text-foreground';
  const textSecondary = 'text-muted-foreground';
  const inputClass =
    'w-full px-3 py-2.5 rounded-lg border border-border/70 bg-card text-xs text-foreground placeholder:text-muted-foreground transition-all duration-200 outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]';
  const labelClass =
    'block text-[11px] font-semibold mb-1.5 uppercase tracking-wider text-muted-foreground';

  // ─────────────────────────── data loading ───────────────────────────
  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [list, aggStats] = await Promise.all([
        api.stations.list(orgId),
        api.stations.stats(orgId).catch(() => null),
      ]);
      setStations(Array.isArray(list) ? list : []);
      setStats(aggStats ?? null);
    } catch (e) {
      setError((e as Error).message || 'Failed to load stations');
      setStations([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  // V4.7.07 — Manually trigger the Mapbox geocoding backfill. Reloads the
  // station list afterwards so the cards / stats / HOME-AWAY badges in
  // Dashboard + FleetView reflect the freshly geocoded coordinates.
  const runBackfill = useCallback(async () => {
    if (!orgId || backfillRunning) return;
    setBackfillRunning(true);
    setBackfillError(null);
    try {
      const res = await api.stations.backfillCoordinates(orgId);
      setBackfillResult(res);
      await load();
    } catch (e) {
      setBackfillError((e as Error).message || 'Backfill fehlgeschlagen');
    } finally {
      setBackfillRunning(false);
    }
  }, [orgId, backfillRunning, load]);

  const stationsMissingCoords = useMemo(
    () => stations.filter((s) => s.latitude == null || s.longitude == null).length,
    [stations],
  );

  // ─────────────────────────── filtering ───────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stations.filter((s) => {
      if (stationScope === 'active' && s.status !== 'ACTIVE') return false;
      if (stationScope === 'assigned' && (s.vehicleCount ?? 0) <= 0) return false;
      if (stationScope === 'setup' && s.latitude != null && s.longitude != null) return false;
      if (!q) return true;
      const haystack = [s.name, s.city, s.address, s.managerName, s.phone, s.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [stations, search, stationScope]);

  // ─────────────────────────── form helpers ───────────────────────────
  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_STATION_FORM);
    setFormError(null);
    setSuggestions([]);
    setSuggestOpen(false);
    setModalOpen(true);
  };

  const openEdit = (station: import('../../lib/api').Station) => {
    setEditingId(station.id);
    setForm({
      name: station.name,
      address: station.address ?? '',
      city: station.city ?? '',
      postalCode: station.postalCode ?? '',
      country: station.country ?? '',
      latitude: station.latitude,
      longitude: station.longitude,
      radiusMeters: station.radiusMeters ?? STATION_RADIUS_DEFAULT_M,
      phone: station.phone ?? '',
      email: station.email ?? '',
      managerName: station.managerName ?? '',
      openingHours: station.openingHours ?? '',
      notes: station.notes ?? '',
      googlePlaceId: station.googlePlaceId,
      status: station.status,
    });
    setFormError(null);
    setSuggestions([]);
    setSuggestOpen(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_STATION_FORM);
    setFormError(null);
    setSuggestions([]);
    setSuggestOpen(false);
  };

  const handleNameChange = (value: string) => {
    setForm((prev) => ({ ...prev, name: value }));
    if (!orgId) return;
    if (suggestTimeout.current) clearTimeout(suggestTimeout.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    setSuggestLoading(true);
    setSuggestOpen(true);
    suggestTimeout.current = setTimeout(() => {
      api.stations
        .searchPlaces(orgId, value)
        .then((res) => setSuggestions(Array.isArray(res) ? res : []))
        .catch(() => setSuggestions([]))
        .finally(() => setSuggestLoading(false));
    }, 350);
  };

  const pickSuggestion = async (sug: import('../../lib/api').StationPlaceSuggestion) => {
    if (!orgId) return;
    setSuggestOpen(false);
    setSuggestions([]);
    const details = await api.stations.placeDetails(orgId, sug.placeId).catch(() => null);
    setForm((prev) => ({
      ...prev,
      name: prev.name || details?.name || sug.mainText,
      address: details?.address ?? prev.address,
      city: details?.city ?? prev.city,
      postalCode: details?.postalCode ?? prev.postalCode,
      country: details?.country ?? prev.country,
      latitude: details?.latitude ?? prev.latitude,
      longitude: details?.longitude ?? prev.longitude,
      phone: details?.phone ?? prev.phone,
      googlePlaceId: sug.placeId,
    }));
  };

  const submit = async () => {
    if (!orgId) return;
    const name = form.name.trim();
    if (!name) {
      setFormError('Stationsname ist erforderlich.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const radius =
        form.radiusMeters == null
          ? null
          : Math.max(
              STATION_RADIUS_MIN_M,
              Math.min(STATION_RADIUS_MAX_M, Math.round(form.radiusMeters)),
            );
      const payload = {
        name,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        postalCode: form.postalCode.trim() || null,
        country: form.country.trim() || null,
        latitude: form.latitude,
        longitude: form.longitude,
        radiusMeters: radius,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        managerName: form.managerName.trim() || null,
        openingHours: form.openingHours.trim() || null,
        notes: form.notes.trim() || null,
        googlePlaceId: form.googlePlaceId,
        status: form.status,
      };
      if (editingId) {
        await api.stations.update(orgId, editingId, payload);
      } else {
        await api.stations.create(orgId, payload);
      }
      await load();
      setModalOpen(false);
      setEditingId(null);
      setForm(EMPTY_STATION_FORM);
    } catch (e) {
      setFormError((e as Error).message || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (station: import('../../lib/api').Station) => {
    if (!orgId) return;
    setTogglingId(station.id);
    try {
      const nextStatus = station.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await api.stations.update(orgId, station.id, { status: nextStatus });
      setStations((prev) =>
        prev.map((s) =>
          s.id === station.id
            ? { ...s, status: nextStatus, statusLabel: nextStatus === 'ACTIVE' ? 'Active' : 'Inactive' }
            : s,
        ),
      );
      // refresh stats in the background
      api.stations.stats(orgId).then(setStats).catch(() => undefined);
    } catch {
      /* no-op; UI remains */
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!orgId || !deletingId) return;
    setDeleting(true);
    try {
      await api.stations.delete(orgId, deletingId);
      await load();
      setDeletingId(null);
    } catch (e) {
      setError((e as Error).message || 'Löschen fehlgeschlagen');
    } finally {
      setDeleting(false);
    }
  };

  // ─────────────────────────── vehicle assignment ───────────────────────────
  const openAssign = useCallback(
    async (station: import('../../lib/api').Station) => {
      if (!orgId) return;
      setAssignStation(station);
      setAssignError(null);
      setAssignSearch('');
      setAssignFilter('all');
      setAssignVehicles([]);
      setAssignSelected(new Set());
      setAssignLoading(true);
      try {
        const res = await api.vehicles.listByOrg(orgId, { limit: 500 });
        const list: AssignVehicleRow[] = ((res as { data?: any[] })?.data ?? []).map((v) => ({
          id: v.id,
          license: v.license ?? v.licensePlate ?? '',
          make: v.make ?? '',
          model: v.model ?? '',
          year: typeof v.year === 'number' ? v.year : null,
          imageUrl: v.imageUrl ?? null,
          stationId: v.stationId ?? null,
          stationName: v.stationName ?? v.station ?? null,
          latitude: typeof v.latitude === 'number' ? v.latitude : null,
          longitude: typeof v.longitude === 'number' ? v.longitude : null,
        }));
        list.sort((a, b) => a.license.localeCompare(b.license, 'de'));
        setAssignVehicles(list);
        setAssignSelected(
          new Set(list.filter((v) => v.stationId === station.id).map((v) => v.id)),
        );
      } catch (e) {
        setAssignError((e as Error).message || 'Fahrzeuge konnten nicht geladen werden');
      } finally {
        setAssignLoading(false);
      }
    },
    [orgId],
  );

  const closeAssign = () => {
    if (assignSaving) return;
    setAssignStation(null);
    setAssignVehicles([]);
    setAssignSelected(new Set());
    setAssignError(null);
    setAssignSearch('');
    setAssignFilter('all');
  };

  const toggleAssignVehicle = (id: string) => {
    setAssignSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitAssign = async () => {
    if (!orgId || !assignStation) return;
    setAssignSaving(true);
    setAssignError(null);
    try {
      await api.stations.setVehicles(
        orgId,
        assignStation.id,
        Array.from(assignSelected),
      );
      await load();
      setAssignStation(null);
      setAssignVehicles([]);
      setAssignSelected(new Set());
    } catch (e) {
      setAssignError((e as Error).message || 'Zuweisung fehlgeschlagen');
    } finally {
      setAssignSaving(false);
    }
  };

  // Filtered + searched view of the vehicle list inside the assignment modal.
  // Computed each render — the list is bounded to ~500 rows so this is cheap
  // and avoids the staleness traps a memo would introduce when the assignment
  // set changes.
  const assignFiltered = (() => {
    const q = assignSearch.trim().toLowerCase();
    const stationId = assignStation?.id ?? null;
    return assignVehicles.filter((v) => {
      if (assignFilter === 'unassigned' && v.stationId !== null) return false;
      if (assignFilter === 'this' && v.stationId !== stationId) return false;
      if (assignFilter === 'other' && (v.stationId === null || v.stationId === stationId)) return false;
      if (!q) return true;
      const haystack = [v.license, v.make, v.model, v.stationName ?? '']
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  })();

  const assignChangeCount = (() => {
    if (!assignStation) return 0;
    let attaches = 0;
    let detaches = 0;
    for (const v of assignVehicles) {
      const wasHere = v.stationId === assignStation.id;
      const willBeHere = assignSelected.has(v.id);
      if (!wasHere && willBeHere) attaches += 1;
      if (wasHere && !willBeHere) detaches += 1;
    }
    return attaches + detaches;
  })();

  // ─────────────────────────── render ───────────────────────────
  const totalStations = stats?.totalStations ?? stations.length;
  const activeStations =
    stats?.activeStations ?? stations.filter((s) => s.status === 'ACTIVE').length;
  const totalVehicles =
    stats?.totalVehicles ?? stations.reduce((sum, s) => sum + s.vehicleCount, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-3">
        <div className="animate-fade-up min-w-0">
          <h2 className="text-[18px] leading-[1.12] font-bold tracking-[-0.02em] text-foreground truncate">
            Stations &amp; Branches
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Suche nach Name, Stadt, Manager…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} w-60 pl-9`}
            />
          </div>
          {stationsMissingCoords > 0 && (
            <button
              type="button"
              onClick={runBackfill}
              disabled={backfillRunning}
              title={`${stationsMissingCoords} Station${stationsMissingCoords === 1 ? '' : 'en'} ohne Koordinaten — jetzt automatisch über Mapbox geocodieren`}
              className="sq-press flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-semibold transition-all disabled:opacity-50 sq-tone-warning hover:opacity-90"
            >
              {backfillRunning ? (
                <Icon name="loader-2" className="w-4 h-4 animate-spin" />
              ) : (
                <Icon name="refresh-cw" className="w-4 h-4" />
              )}
              Koordinaten nachziehen ({stationsMissingCoords})
            </button>
          )}
          <button
            onClick={openCreate}
            className="sq-press flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border"
          >
            <Icon name="plus" className="w-4 h-4 text-[color:var(--brand)]" /> Standort hinzufügen
          </button>
        </div>
      </div>

      {/* V4.7.07 — Backfill result banner. Stays visible until the user
          clicks the X to dismiss. Lists every station that was checked
          along with the new coords (geocoded), the failure reason
          (failed) or the missing-data reason (skipped). */}
      {(backfillResult || backfillError) && (
        <div
          className={`rounded-xl border p-3 ${
            backfillError
              ? 'sq-tone-critical border border-border'
              : 'sq-tone-success border border-border'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {backfillError ? (
                <>
                  <p className={`text-xs font-semibold ${'text-[color:var(--status-critical)]'}`}>
                    Geocoding fehlgeschlagen
                  </p>
                  <p className={`text-[11px] mt-0.5 ${'text-[color:var(--status-critical)]'}`}>
                    {backfillError}
                  </p>
                </>
              ) : backfillResult ? (
                <>
                  <p className={`text-xs font-semibold ${'text-[color:var(--status-positive)]'}`}>
                    Backfill abgeschlossen — {backfillResult.totalGeocoded} geocodiert
                    {backfillResult.totalFailed > 0 && `, ${backfillResult.totalFailed} fehlgeschlagen`}
                    {backfillResult.totalSkipped > 0 && `, ${backfillResult.totalSkipped} übersprungen`}
                  </p>
                  {backfillResult.results.length > 0 && (
                    <ul className={`mt-1.5 space-y-0.5 text-[10.5px] ${'text-[color:var(--status-positive)]'}`}>
                      {backfillResult.results.slice(0, 8).map((r) => (
                        <li key={r.stationId} className="flex items-center gap-2">
                          {r.status === 'geocoded' && <Icon name="check-circle" className="w-3 h-3 shrink-0" />}
                          {r.status === 'failed' && <Icon name="x-circle" className="w-3 h-3 shrink-0 text-red-400" />}
                          {r.status === 'skipped' && <Icon name="alert-circle" className="w-3 h-3 shrink-0 text-amber-400" />}
                          <span className="font-semibold">{r.stationName}</span>
                          {r.status === 'geocoded' && r.latitude != null && r.longitude != null && (
                            <span className="font-mono opacity-80">
                              {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                            </span>
                          )}
                          {r.reason && <span className="opacity-80">— {r.reason}</span>}
                        </li>
                      ))}
                      {backfillResult.results.length > 8 && (
                        <li className="opacity-70">… und {backfillResult.results.length - 8} weitere</li>
                      )}
                    </ul>
                  )}
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setBackfillResult(null);
                setBackfillError(null);
              }}
              className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Hinweis schließen"
            >
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Stats strip */}
      {!loading && stations.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StationStatPill
            icon={<Icon name="map-pin" className="w-4 h-4" />}
            label="Alle"
            value={totalStations}
            tone="brand"
            active={stationScope === 'all'}
            onClick={() => setStationScope('all')}
          />
          <StationStatPill
            icon={<Icon name="check-circle" className="w-4 h-4" />}
            label="Aktiv"
            value={activeStations}
            tone="success"
            active={stationScope === 'active'}
            onClick={() => setStationScope('active')}
          />
          <StationStatPill
            icon={<Icon name="car" className="w-4 h-4" />}
            label="Fahrzeuge"
            value={totalVehicles}
            tone="neutral"
            active={stationScope === 'assigned'}
            onClick={() => setStationScope('assigned')}
          />
          <StationStatPill
            icon={<Icon name="alert-circle" className="w-4 h-4" />}
            label="Setup"
            value={stationsMissingCoords}
            tone={stationsMissingCoords > 0 ? 'warning' : 'neutral'}
            active={stationScope === 'setup'}
            onClick={() => setStationScope('setup')}
          />
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${
            'sq-tone-critical border border-border'
          }`}
        >
          <Icon name="alert-circle" className="w-4 h-4" />
          {error}
          <button
            onClick={load}
            className="ml-auto text-xs font-semibold underline-offset-2 hover:underline"
          >
            Erneut laden
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className={`${cardClass} flex items-center justify-center py-12`}>
          <Icon name="loader-2" className="w-5 h-5 animate-spin text-[color:var(--brand)] mr-2" />
          <span className={`text-xs ${textSecondary}`}>Standorte werden geladen…</span>
        </div>
      ) : stations.length === 0 ? (
        // Empty state
        <div className={`${cardClass} flex flex-col items-center justify-center py-16 px-6 text-center border-dashed`}>
          <div className="p-4 rounded-full mb-3 sq-tone-brand">
            <Icon name="map-pin" className="w-10 h-10" />
          </div>
          <p className={`text-sm font-semibold ${textPrimary}`}>Noch keine Standorte</p>
          <p className={`text-xs mt-1 max-w-sm ${textSecondary}`}>
            Legen Sie Ihren ersten Standort an, um Fahrzeuge und Benutzer geografisch zuzuordnen.
          </p>
          <button
            onClick={openCreate}
            className="sq-press mt-4 flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border"
          >
            <Icon name="plus" className="w-4 h-4 text-[color:var(--brand)]" /> Standort hinzufügen
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${cardClass} text-center py-10`}>
          <p className={`text-xs ${textSecondary}`}>Keine Treffer für &quot;{search}&quot;.</p>
        </div>
      ) : (
        // Station list
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((station) => (
            <StationCard
              key={station.id}
              station={station}
              onEdit={() => openEdit(station)}
              onDelete={() => setDeletingId(station.id)}
              onToggleStatus={() => toggleStatus(station)}
              onAssign={() => openAssign(station)}
              toggling={togglingId === station.id}
            />
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl ${
              'bg-card border border-border'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b ${
                'bg-card border-border'
              }`}
            >
              <div>
                <h3 className={`text-base font-semibold ${textPrimary}`}>
                  {editingId ? 'Standort bearbeiten' : 'Neuen Standort anlegen'}
                </h3>
                <p className={`text-[11px] mt-0.5 ${textSecondary}`}>
                  {editingId
                    ? 'Aktualisieren Sie Adresse, Kontakt und Status dieses Standorts.'
                    : 'Tippen Sie den Namen oder die Adresse ein — Google Places vervollständigt automatisch.'}
                </p>
              </div>
              <button
                onClick={closeModal}
                disabled={saving}
                className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                  'hover:bg-muted'
                }`}
              >
                <Icon name="x" className={`w-5 h-5 ${textSecondary}`} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Name + place autocomplete */}
              <div className="relative">
                <label className={labelClass}>Stationsname / Adresse</label>
                <input
                  type="text"
                  placeholder="z.B. SynqDrive Berlin Mitte"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onFocus={() => form.name.trim().length >= 2 && suggestions.length > 0 && setSuggestOpen(true)}
                  onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                  className={inputClass}
                  autoComplete="off"
                />
                {suggestOpen && (suggestLoading || suggestions.length > 0) && (
                  <div
                    className={`absolute z-20 mt-1 w-full rounded-lg border shadow-2xl max-h-64 overflow-y-auto ${
                      'bg-card border-border'
                    }`}
                  >
                    {suggestLoading ? (
                      <div className={`px-3 py-2.5 text-xs flex items-center gap-2 ${textSecondary}`}>
                        <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
                        Suche Standorte…
                      </div>
                    ) : (
                      suggestions.map((s) => (
                        <button
                          key={s.placeId}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickSuggestion(s)}
                          className="w-full text-left px-3 py-2.5 text-xs border-b border-border last:border-b-0 transition-colors hover:bg-muted text-foreground"
                        >
                          <div className="font-medium flex items-center gap-1.5">
                            <Icon name="map-pin" className="w-3.5 h-3.5 text-blue-500" /> {s.mainText}
                          </div>
                          {s.secondaryText && (
                            <div className={`${textSecondary} text-[11px] mt-0.5 ml-5`}>
                              {s.secondaryText}
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Address grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Straße / Adresse</label>
                  <input
                    type="text"
                    placeholder="Musterstraße 12"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>PLZ</label>
                  <input
                    type="text"
                    placeholder="10115"
                    value={form.postalCode}
                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Stadt</label>
                  <input
                    type="text"
                    placeholder="Berlin"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Land</label>
                  <input
                    type="text"
                    placeholder="Deutschland"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* V4.7.07 — Manual Lat/Lng override. Auto-fills on save via
                  the backend Mapbox geocoder when left empty + an address
                  is set. Surfaced as an explicit override so the user can
                  paste coordinates from Google Maps if Mapbox returns the
                  wrong building (rare but possible for big complexes). */}
              <div
                className="rounded-xl border border-border bg-muted/40 p-3.5"
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 ${
                      'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon name="map-pin" className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <label className={`block text-[11px] font-semibold uppercase tracking-wider ${
                      'text-foreground'
                    }`}>
                      Koordinaten {form.latitude != null && form.longitude != null && (
                        <span className="ml-2 text-[9px] font-normal normal-case tracking-normal text-emerald-500">
                          ✓ gesetzt
                        </span>
                      )}
                    </label>
                    <p className={`text-[10.5px] mt-0.5 ${textSecondary}`}>
                      Beim Speichern automatisch aus der Adresse berechnet (Mapbox).
                      Optional manuell überschreiben — z.B. aus Google Maps kopieren.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-[10px] font-semibold mb-1 uppercase tracking-wider ${textSecondary}`}>
                      Breitengrad (Lat)
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      min={-90}
                      max={90}
                      value={form.latitude ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setForm({ ...form, latitude: null });
                          return;
                        }
                        const n = Number(raw);
                        if (Number.isFinite(n)) setForm({ ...form, latitude: n });
                      }}
                      placeholder="51.31657"
                      className={`${inputClass} font-mono tabular-nums`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[10px] font-semibold mb-1 uppercase tracking-wider ${textSecondary}`}>
                      Längengrad (Lng)
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      min={-180}
                      max={180}
                      value={form.longitude ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setForm({ ...form, longitude: null });
                          return;
                        }
                        const n = Number(raw);
                        if (Number.isFinite(n)) setForm({ ...form, longitude: n });
                      }}
                      placeholder="9.49793"
                      className={`${inputClass} font-mono tabular-nums`}
                    />
                  </div>
                </div>
                {(form.latitude != null || form.longitude != null) && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, latitude: null, longitude: null, googlePlaceId: null })}
                    className={`mt-1.5 text-[10px] underline-offset-2 hover:underline ${textSecondary}`}
                  >
                    Koordinaten zurücksetzen (beim nächsten Speichern wird neu geocodiert)
                  </button>
                )}
              </div>

              {/* Geofence radius — defines the "at home" zone for this station */}
              <div
                className="rounded-xl border border-border bg-[color:var(--brand-soft)] p-3.5"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        'sq-tone-brand'
                      }`}
                    >
                      <Icon name="crosshair" className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <label className={`block text-[11px] font-semibold uppercase tracking-wider ${
                        'text-foreground'
                      }`}>
                        Geofence-Umkreis (Home-Zone)
                      </label>
                      <p className={`text-[10.5px] mt-0.5 ${textSecondary}`}>
                        Fahrzeuge gelten als <span className="font-semibold">vor Ort / Home</span>, sobald
                        ihre GPS-Position innerhalb dieses Radius liegt.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={STATION_RADIUS_MIN_M}
                      max={STATION_RADIUS_MAX_M}
                      step={5}
                      value={form.radiusMeters ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setForm({ ...form, radiusMeters: null });
                          return;
                        }
                        const n = Number(raw);
                        if (!Number.isFinite(n)) return;
                        setForm({
                          ...form,
                          radiusMeters: Math.max(
                            STATION_RADIUS_MIN_M,
                            Math.min(STATION_RADIUS_MAX_M, Math.round(n)),
                          ),
                        });
                      }}
                      placeholder={String(STATION_RADIUS_DEFAULT_M)}
                      className={`w-20 px-2 py-1.5 rounded-md border text-[11px] tabular-nums text-right transition-all duration-200 ${
                        'border-border/70 bg-card text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]'
                      } outline-none`}
                    />
                    <span className={`text-[11px] font-semibold ${textSecondary}`}>m</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={STATION_RADIUS_MIN_M}
                  max={STATION_RADIUS_MAX_M}
                  step={5}
                  value={form.radiusMeters ?? STATION_RADIUS_DEFAULT_M}
                  onChange={(e) =>
                    setForm({ ...form, radiusMeters: Number(e.target.value) })
                  }
                  className={`w-full accent-blue-600 cursor-pointer ${
                    form.radiusMeters == null ? 'opacity-50' : ''
                  }`}
                />
                <div className={`flex items-center justify-between mt-1.5 text-[10px] ${textSecondary}`}>
                  <span>{STATION_RADIUS_MIN_M} m</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, radiusMeters: 100 })}
                      className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${
                        form.radiusMeters === 100
                          ? 'sq-tone-brand'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      Parkplatz · 100m
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, radiusMeters: 250 })}
                      className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${
                        form.radiusMeters === 250
                          ? 'sq-tone-brand'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      Filiale · 250m
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, radiusMeters: 1000 })}
                      className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${
                        form.radiusMeters === 1000
                          ? 'sq-tone-brand'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      Gelände · 1km
                    </button>
                  </div>
                  <span>{STATION_RADIUS_MAX_M >= 1000 ? `${STATION_RADIUS_MAX_M / 1000} km` : `${STATION_RADIUS_MAX_M} m`}</span>
                </div>
                {(form.latitude == null || form.longitude == null) && (
                  <p
                    className={`mt-2 text-[10.5px] flex items-start gap-1.5 ${
                      'text-[color:var(--status-watch)]'
                    }`}
                  >
                    <Icon name="alert-circle" className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>
                      Hinweis: Der Umkreis greift erst, wenn die Station Koordinaten hat.
                      Beim Speichern werden Lat/Lng automatisch aus der Adresse berechnet —
                      oder Sie tragen sie oben manuell ein.
                    </span>
                  </p>
                )}
              </div>

              {/* Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Stationsleiter</label>
                  <input
                    type="text"
                    placeholder="Vor- und Nachname"
                    value={form.managerName}
                    onChange={(e) => setForm({ ...form, managerName: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Telefon</label>
                  <input
                    type="tel"
                    placeholder="+49 30 1234567"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>E-Mail</label>
                  <input
                    type="email"
                    placeholder="station@firma.de"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Öffnungszeiten</label>
                  <input
                    type="text"
                    placeholder="Mo–Fr 08:00–18:00"
                    value={form.openingHours}
                    onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={labelClass}>Notizen</label>
                <textarea
                  rows={3}
                  placeholder="Interne Notizen zum Standort…"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {/* Status */}
              <div>
                <label className={labelClass}>Status</label>
                <div className="flex gap-2">
                  {(['ACTIVE', 'INACTIVE'] as const).map((st) => {
                    const active = form.status === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setForm({ ...form, status: st })}
                        className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                          active
                            ? st === 'ACTIVE'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-neutral-500 text-white border-neutral-500'
                            : 'border border-border/60 bg-card text-foreground hover:bg-muted'
                        }`}
                      >
                        {st === 'ACTIVE' ? 'Aktiv' : 'Inaktiv'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.latitude !== null && form.longitude !== null && (
                <div className={`text-[11px] ${textSecondary}`}>
                  Koordinaten: {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
                  {form.googlePlaceId && <> · <span className="font-mono">{form.googlePlaceId.slice(0, 18)}…</span></>}
                </div>
              )}

              {formError && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${
                    'sq-tone-critical border border-border'
                  }`}
                >
                  <Icon name="alert-circle" className="w-4 h-4" />
                  {formError}
                </div>
              )}
            </div>

            <div
              className={`sticky bottom-0 flex items-center justify-end gap-2 px-5 py-4 border-t ${
                'bg-card border-border'
              }`}
            >
              <button
                onClick={closeModal}
                disabled={saving}
                className={`px-4 py-2.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                  'border border-border/60 bg-card text-foreground hover:bg-muted'
                }`}
              >
                Abbrechen
              </button>
              <button
                onClick={submit}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Icon name="loader-2" className="w-4 h-4 animate-spin" /> Speichere…
                  </>
                ) : (
                  <>
                    <Icon name="save" className="w-4 h-4" />
                    {editingId ? 'Aktualisieren' : 'Standort anlegen'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !deleting && setDeletingId(null)}
        >
          <div
            className={`w-full max-w-md rounded-2xl shadow-2xl p-5 ${
              'bg-card border border-border'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className={`p-2.5 rounded-lg ${'sq-tone-critical'}`}>
                <Icon name="alert-circle" className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className={`text-sm font-semibold ${textPrimary}`}>Standort löschen?</h3>
                <p className={`text-xs mt-1 ${textSecondary}`}>
                  {(() => {
                    const s = stations.find((x) => x.id === deletingId);
                    return s
                      ? s.vehicleCount > 0
                        ? `${s.vehicleCount} Fahrzeug(e) sind diesem Standort zugewiesen und werden entkoppelt. Diese Aktion kann nicht rückgängig gemacht werden.`
                        : 'Diese Aktion kann nicht rückgängig gemacht werden.'
                      : 'Diese Aktion kann nicht rückgängig gemacht werden.';
                  })()}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingId(null)}
                disabled={deleting}
                className={`px-4 py-2.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                  'border border-border/60 bg-card text-foreground hover:bg-muted'
                }`}
              >
                Abbrechen
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <Icon name="loader-2" className="w-4 h-4 animate-spin" /> Lösche…
                  </>
                ) : (
                  <>
                    <Icon name="trash-2" className="w-4 h-4" /> Löschen
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle assignment modal */}
      {assignStation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeAssign}
        >
          <div
            className={`w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl shadow-2xl ${
              'bg-card border border-border'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className={`flex items-start justify-between px-5 py-4 border-b ${
                'border-border'
              }`}
            >
              <div className="min-w-0">
                <h3 className={`text-base font-semibold flex items-center gap-2 ${textPrimary}`}>
                  <Icon name="car" className="w-4 h-4 text-blue-500" />
                  Fahrzeuge zuweisen
                </h3>
                <p className={`text-[11px] mt-0.5 truncate ${textSecondary}`}>
                  Standort: <span className={`font-medium ${textPrimary}`}>{assignStation.name}</span>
                  {' · '}
                  {assignSelected.size} ausgewählt
                  {assignChangeCount > 0 && (
                    <>
                      {' · '}
                      <span className="text-blue-500 font-semibold">{assignChangeCount} Änderung(en)</span>
                    </>
                  )}
                </p>
              </div>
              <button
                onClick={closeAssign}
                disabled={assignSaving}
                className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                  'hover:bg-muted'
                }`}
              >
                <Icon name="x" className={`w-5 h-5 ${textSecondary}`} />
              </button>
            </div>

            {/* Filter / search bar */}
            <div
              className={`px-5 py-3 border-b flex flex-wrap items-center gap-2 ${
                'border-border'
              }`}
            >
              <div className="relative flex-1 min-w-[220px]">
                <Icon name="search" className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
                <input
                  type="text"
                  placeholder="Suche nach Kennzeichen, Modell, Standort…"
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 rounded-lg border text-xs transition-all duration-200 ${
                    'border-border/70 bg-card text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]'
                  } outline-none`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {([
                  { id: 'all', label: 'Alle' },
                  { id: 'this', label: 'Aktuell hier' },
                  { id: 'unassigned', label: 'Ohne Station' },
                  { id: 'other', label: 'Andere Station' },
                ] as const).map((opt) => {
                  const active = assignFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setAssignFilter(opt.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border border-border/60 bg-card text-foreground hover:bg-muted'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3">
              {assignLoading ? (
                <div className={`flex items-center justify-center py-12 ${textSecondary}`}>
                  <Icon name="loader-2" className="w-5 h-5 animate-spin text-blue-500 mr-2" />
                  <span className="text-xs">Fahrzeuge werden geladen…</span>
                </div>
              ) : assignError ? (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${
                    'sq-tone-critical border border-border'
                  }`}
                >
                  <Icon name="alert-circle" className="w-4 h-4" /> {assignError}
                </div>
              ) : assignVehicles.length === 0 ? (
                <div className={`text-center py-10 text-xs ${textSecondary}`}>
                  Keine Fahrzeuge in dieser Organisation registriert.
                </div>
              ) : assignFiltered.length === 0 ? (
                <div className={`text-center py-10 text-xs ${textSecondary}`}>
                  Keine Treffer für die gewählten Filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1.5">
                  {assignFiltered.map((v) => {
                    const checked = assignSelected.has(v.id);
                    const wasHere = v.stationId === assignStation.id;
                    const willMove =
                      checked && v.stationId !== null && v.stationId !== assignStation.id;
                    const willDetach = !checked && wasHere;
                    // Live geofence check — true ⇢ vehicle's last GPS fix is
                    // inside this station's radius. Only useful when the
                    // station has lat/lng + radius configured.
                    const atHome = isVehicleAtHomeStation(v, assignStation);
                    return (
                      <label
                        key={v.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[color:var(--brand-soft)] border-[color:var(--brand)]/40'
                            : 'bg-card border-border hover:bg-muted/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignVehicle(v.id)}
                          className="w-4 h-4 accent-blue-600 cursor-pointer shrink-0"
                        />
                        <div className={`p-1.5 rounded-lg shrink-0 ${
                          'bg-muted'
                        }`}>
                          <Icon name="car" className={`w-3.5 h-3.5 ${textSecondary}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold tabular-nums ${textPrimary}`}>
                              {v.license || '—'}
                            </span>
                            <span className={`text-[11px] truncate ${textSecondary}`}>
                              {[v.make, v.model].filter(Boolean).join(' ')}
                              {v.year ? ` · ${v.year}` : ''}
                            </span>
                          </div>
                          <div className="flex items-center flex-wrap gap-1.5 mt-0.5 text-[10px]">
                            <span className={textSecondary}>Aktuell:</span>
                            {v.stationId === null ? (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold sq-tone-watch"
                              >
                                ohne Station
                              </span>
                            ) : v.stationId === assignStation.id ? (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold sq-tone-success"
                              >
                                <Icon name="check-circle" className="w-2.5 h-2.5" />
                                {assignStation.name}
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold sq-tone-neutral"
                              >
                                <Icon name="map-pin" className="w-2.5 h-2.5" />
                                {v.stationName ?? 'Andere'}
                              </span>
                            )}
                            {atHome === true && (
                              <span
                                title={`GPS-Position im ${assignStation.radiusMeters}m-Radius dieser Station`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold sq-tone-brand"
                              >
                                <Icon name="crosshair" className="w-2.5 h-2.5" />
                                vor Ort
                              </span>
                            )}
                          </div>
                        </div>
                        {willMove && (
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${
                              'sq-tone-brand'
                            }`}
                          >
                            Wird verschoben
                          </span>
                        )}
                        {willDetach && (
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${
                              'sq-tone-watch'
                            }`}
                          >
                            Wird entfernt
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className={`flex items-center justify-between gap-2 px-5 py-3 border-t ${
                'border-border'
              }`}
            >
              <span className={`text-[11px] ${textSecondary}`}>
                {assignChangeCount === 0
                  ? 'Keine ausstehenden Änderungen'
                  : `${assignChangeCount} ausstehende Änderung(en)`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeAssign}
                  disabled={assignSaving}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                    'border border-border/60 bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  Abbrechen
                </button>
                <button
                  onClick={submitAssign}
                  disabled={assignSaving || assignLoading || assignChangeCount === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {assignSaving ? (
                    <>
                      <Icon name="loader-2" className="w-4 h-4 animate-spin" /> Speichere…
                    </>
                  ) : (
                    <>
                      <Icon name="save" className="w-4 h-4" /> Zuweisung speichern
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StationStatPill({
  icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'brand' | 'success' | 'warning' | 'critical' | 'neutral';
  active: boolean;
  onClick: () => void;
}) {
  const toneClass =
    tone === 'brand'
      ? 'sq-tone-brand'
      : tone === 'success'
        ? 'sq-tone-success'
        : tone === 'warning'
          ? 'sq-tone-warning'
          : tone === 'critical'
            ? 'sq-tone-critical'
            : 'sq-tone-neutral';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl p-3 text-left transition-all duration-200 ${toneClass} ${
        active
          ? 'shadow-[inset_0_0_0_1px_currentColor,0_6px_14px_rgba(15,23,42,0.12)]'
          : 'opacity-80 hover:opacity-100 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3 w-full">
        <div>
          <div className="text-[18px] leading-none font-bold tabular-nums">
            {value}
          </div>
          <div className="text-[9px] mt-1 font-semibold uppercase tracking-wider opacity-75">
            {label}
          </div>
        </div>
        <div className="shrink-0 opacity-80">
          {icon}
        </div>
      </div>
    </button>
  );
}

function StationCard({
  station,
  onEdit,
  onDelete,
  onToggleStatus,
  onAssign,
  toggling,
}: {
  station: import('../../lib/api').Station;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onAssign: () => void;
  toggling: boolean;
}) {
  const textPrimary = 'text-foreground';
  const textSecondary = 'text-muted-foreground';

  const isActive = station.status === 'ACTIVE';
  const addressLine = [station.address, station.postalCode, station.city]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="rounded-xl p-4 border border-border/60 bg-card hover:bg-muted/40 hover:border-border transition-all duration-200">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: identity */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="p-3 rounded-lg shrink-0 sq-tone-brand">
            <Icon name="map-pin" className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-sm font-semibold truncate ${textPrimary}`}>{station.name}</h3>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  isActive
                    ? 'sq-tone-success'
                    : 'sq-tone-neutral'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                  }`}
                />
                {isActive ? 'Aktiv' : 'Inaktiv'}
              </span>
            </div>
            {addressLine && (
              <p className={`text-xs mt-0.5 truncate ${textSecondary}`}>{addressLine}</p>
            )}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
              {station.openingHours && (
                <span className={`text-[11px] flex items-center gap-1 ${textSecondary}`}>
                  <Icon name="clock" className="w-3 h-3" /> {station.openingHours}
                </span>
              )}
              {station.radiusMeters != null && (
                <span
                  title={
                    station.latitude != null && station.longitude != null
                      ? `Fahrzeuge innerhalb von ${station.radiusMeters} m gelten als „vor Ort"`
                      : 'Umkreis konfiguriert — wirkt erst, wenn die Station Koordinaten hat.'
                  }
                  className={`text-[11px] flex items-center gap-1 ${
                    station.latitude != null && station.longitude != null
                      ? textSecondary
                      : 'text-[color:var(--status-attention)]'
                  }`}
                >
                  <Icon name="crosshair" className="w-3 h-3" />
                  Umkreis{' '}
                  <span className="font-semibold tabular-nums">
                    {station.radiusMeters >= 1000
                      ? `${(station.radiusMeters / 1000).toFixed(station.radiusMeters % 1000 === 0 ? 0 : 1)} km`
                      : `${station.radiusMeters} m`}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Middle: contact + vehicles */}
        <div className="flex flex-wrap items-center gap-4 lg:gap-5">
          <div className="flex flex-col">
            <span className={`text-[10px] uppercase tracking-wider font-semibold ${textSecondary}`}>
              Fahrzeuge
            </span>
            <span className={`text-sm font-bold ${textPrimary}`}>{station.vehicleCount}</span>
          </div>
          {station.managerName && (
            <div className="flex flex-col min-w-0 max-w-[180px]">
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${textSecondary}`}>
                Manager
              </span>
              <span className={`text-xs truncate ${textPrimary}`}>{station.managerName}</span>
            </div>
          )}
          {station.phone && (
            <div className="flex flex-col min-w-0 max-w-[160px]">
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${textSecondary}`}>
                Telefon
              </span>
              <a
                href={`tel:${station.phone}`}
                className={`text-xs hover:underline truncate ${textPrimary}`}
              >
                {station.phone}
              </a>
            </div>
          )}
          {station.email && (
            <div className="flex flex-col min-w-0 max-w-[200px]">
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${textSecondary}`}>
                E-Mail
              </span>
              <a
                href={`mailto:${station.email}`}
                className={`text-xs hover:underline truncate ${textPrimary}`}
              >
                {station.email}
              </a>
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onAssign}
            title="Fahrzeuge zu diesem Standort zuweisen"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors mr-1 sq-tone-brand hover:opacity-90"
          >
            <Icon name="car" className="w-3.5 h-3.5" /> Fahrzeuge zuweisen
          </button>
          <button
            onClick={onToggleStatus}
            disabled={toggling}
            title={isActive ? 'Deaktivieren' : 'Aktivieren'}
            className="p-2 rounded-lg transition-colors disabled:opacity-50 hover:bg-muted"
          >
            {toggling ? (
              <Icon name="loader-2" className={`w-4 h-4 animate-spin ${textSecondary}`} />
            ) : isActive ? (
              <Icon name="toggle-right" className={`w-5 h-5 text-emerald-500`} />
            ) : (
              <Icon name="toggle-left" className={`w-5 h-5 ${textSecondary}`} />
            )}
          </button>
          <button
            onClick={onEdit}
            title="Bearbeiten"
            className="p-2 rounded-lg transition-colors hover:bg-muted"
          >
            <Icon name="edit-3" className={`w-4 h-4 ${textSecondary}`} />
          </button>
          <button
            onClick={onDelete}
            title="Löschen"
            className="p-2 rounded-lg hover:bg-red-100 hover:text-red-500 transition-colors"
          >
            <Icon name="trash-2" className={`w-4 h-4 ${textSecondary}`} />
          </button>
        </div>
      </div>

      {station.notes && (
        <p
          className={`text-[11px] mt-3 pt-3 border-t italic ${
            'border-border/50 text-muted-foreground'
          }`}
        >
          {station.notes}
        </p>
      )}
    </div>
  );
}

function formatLastActive(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffH / 24);
  if (diffMin < 1) return 'Jetzt online';
  if (diffMin < 60) return `Vor ${diffMin} Min`;
  if (diffH < 24) return `Vor ${diffH}h`;
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `Vor ${diffDays} Tagen`;
  return `Vor ${Math.floor(diffDays / 7)} Woche(n)`;
}

// UsersRolesTab is now imported from './UsersRolesTab'

// ============================================
// BILLING & SUBSCRIPTIONS TAB
// ============================================
function BillingTab() {
  type BillingSubscriptionDto = {
    id: string;
    plan?: string | null;
    status?: string | null;
    mrr?: number | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    invoices?: BillingInvoiceDto[];
  };
  type BillingInvoiceDto = {
    id: string;
    amount?: number | null;
    amountCents?: number | null;
    status?: string | null;
    date?: string | null;
    invoiceDate?: string | null;
    dueDate?: string | null;
    paidAt?: string | null;
    invoicePdfUrl?: string | null;
    stripeInvoiceId?: string | null;
    plan?: string | null;
  };

  const { orgId } = useRentalOrg();
  const [subscription, setSubscription] = useState<BillingSubscriptionDto | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoiceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<'all' | 'paid' | 'pending' | 'overdue'>('all');

  const cardClass = 'sq-card rounded-2xl p-5 shadow-[var(--shadow-1)]';
  const spinnerClass = 'border-[color:var(--brand)]';
  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs text-foreground placeholder:text-muted-foreground transition-all duration-200 outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]';
  const planCatalog = [
    { name: 'Starter', aliases: ['Starter'], price: '€24,99', desc: 'Bis 4 Fahrzeuge', features: ['Bis 4 Fahrzeuge', '2 Benutzer', 'Basis-Telematik', 'E-Mail Support'], tone: 'sq-tone-neutral' },
    { name: 'Professional', aliases: ['Professional', 'Business'], price: '€20,99', desc: 'Bis 12 Fahrzeuge', features: ['Bis 12 Fahrzeuge', '10 Benutzer', 'Erweiterte Telematik', 'AI Insights', 'Prioritäts-Support', 'API Zugang'], tone: 'sq-tone-brand' },
    { name: 'Enterprise', aliases: ['Enterprise', 'Custom'], price: '€18,99', desc: 'Ab 12+ Fahrzeuge', features: ['Ab 12+ Fahrzeuge', 'Unbegrenzte Benutzer', 'Premium Telematik', 'AI Fleet Assistant', 'Dedizierter Support', 'Custom Integrationen'], tone: 'sq-tone-success' },
  ];

  useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setSubscription(null);
      setInvoices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    Promise.all([
      api.billing.orgSubscriptions().catch(() => null),
      api.billing.orgInvoices().catch(() => null),
    ])
      .then(([subscriptionResult, invoiceResult]) => {
        if (cancelled) return;
        const nextSubscription = Array.isArray(subscriptionResult)
          ? (subscriptionResult[0] ?? null)
          : (subscriptionResult as BillingSubscriptionDto | null);
        const invoiceList = Array.isArray(invoiceResult)
          ? invoiceResult
          : Array.isArray((invoiceResult as { data?: BillingInvoiceDto[] } | null)?.data)
            ? ((invoiceResult as { data: BillingInvoiceDto[] }).data)
            : [];
        setSubscription(nextSubscription);
        setInvoices(invoiceList.length > 0 ? invoiceList : (nextSubscription?.invoices ?? []));
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message || 'Billing data could not be loaded');
        setSubscription(null);
        setInvoices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [orgId]);

  const formatMoney = (value: number | null | undefined) =>
    typeof value === 'number'
      ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
      : '—';
  const invoiceAmount = (invoice: BillingInvoiceDto) =>
    typeof invoice.amount === 'number'
      ? invoice.amount
      : typeof invoice.amountCents === 'number'
        ? invoice.amountCents / 100
        : null;
  const formatDateShort = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return iso;
    }
  };
  const normalizeStatus = (status: string | null | undefined) => (status ?? 'Pending').toLowerCase();
  const statusLabel = (status: string | null | undefined) => {
    const normalized = normalizeStatus(status);
    if (normalized === 'paid') return 'Bezahlt';
    if (normalized === 'overdue' || normalized === 'uncollectible') return 'Überfällig';
    if (normalized === 'open' || normalized === 'pending' || normalized === 'draft') return 'Offen';
    return status ?? 'Offen';
  };
  const statusTone = (status: string | null | undefined) => {
    const normalized = normalizeStatus(status);
    if (normalized === 'paid') return 'sq-tone-success';
    if (normalized === 'overdue' || normalized === 'uncollectible') return 'sq-tone-critical';
    return 'sq-tone-warning';
  };

  const currentPlanName = subscription?.plan ?? null;
  const currentPlan = planCatalog.find(plan => plan.aliases.some(alias => alias.toLowerCase() === currentPlanName?.toLowerCase())) ?? null;
  const currentMrr = subscription?.mrr ?? (invoices[0] ? invoiceAmount(invoices[0]) : null);
  const paidInvoiceCount = invoices.filter(invoice => normalizeStatus(invoice.status) === 'paid').length;
  const openInvoiceCount = invoices.filter(invoice => normalizeStatus(invoice.status) !== 'paid').length;
  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    return invoices.filter(invoice => {
      const normalized = normalizeStatus(invoice.status);
      if (invoiceStatus === 'paid' && normalized !== 'paid') return false;
      if (invoiceStatus === 'pending' && !['open', 'pending', 'draft'].includes(normalized)) return false;
      if (invoiceStatus === 'overdue' && !['overdue', 'uncollectible'].includes(normalized)) return false;
      if (!q) return true;
      return [invoice.id, invoice.stripeInvoiceId, invoice.plan, statusLabel(invoice.status)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [invoices, invoiceSearch, invoiceStatus]);
  const hasActiveFilters = invoiceSearch.trim().length > 0 || invoiceStatus !== 'all';
  const clearFilters = () => {
    setInvoiceSearch('');
    setInvoiceStatus('all');
  };
  const statusOptions = [
    { key: 'all', label: 'All invoices', count: invoices.length },
    { key: 'paid', label: 'Paid', count: paidInvoiceCount },
    { key: 'pending', label: 'Open', count: invoices.filter(invoice => ['open', 'pending', 'draft'].includes(normalizeStatus(invoice.status))).length },
    { key: 'overdue', label: 'Overdue', count: invoices.filter(invoice => ['overdue', 'uncollectible'].includes(normalizeStatus(invoice.status))).length },
  ] as const;
  const activeStatus = statusOptions.find(option => option.key === invoiceStatus) ?? statusOptions[0];
  const summaryCards = [
    { label: 'Current Plan', value: currentPlan?.name ?? 'Setup', meta: subscription?.status ?? 'No subscription record', icon: CreditCard, tone: subscription ? 'sq-tone-brand' : 'sq-tone-warning' },
    { label: 'Monthly', value: formatMoney(currentMrr), meta: 'MRR from Billing API', icon: Database, tone: currentMrr ? 'sq-tone-success' : 'sq-tone-neutral' },
    { label: 'Renewal', value: formatDateShort(subscription?.currentPeriodEnd), meta: subscription?.currentPeriodStart ? `Since ${formatDateShort(subscription.currentPeriodStart)}` : 'No period synced', icon: Clock, tone: subscription?.currentPeriodEnd ? 'sq-tone-info' : 'sq-tone-neutral' },
    { label: 'Invoices', value: invoices.length, meta: `${openInvoiceCount} open · ${paidInvoiceCount} paid`, icon: UserCog, tone: openInvoiceCount > 0 ? 'sq-tone-warning' : 'sq-tone-success' },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <div className="min-h-8 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.018em] text-foreground">Billing & Subscriptions</h2>
          <p className="text-[13px] mt-1 text-muted-foreground">
            Tenant-scoped subscription status, billing period and invoice history from the existing Billing API.
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${subscription ? 'sq-tone-success' : 'sq-tone-warning'}`}>
          <Icon name={subscription ? 'check-circle-2' : 'alert-circle'} className="w-4 h-4" />
          {subscription ? 'Billing synced' : 'Billing setup needed'}
        </span>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className={`w-8 h-8 border-2 border-t-transparent rounded-full animate-spin ${spinnerClass}`} />
          <p className="text-xs mt-3 text-muted-foreground">Loading billing data...</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="rounded-2xl p-4 sq-tone-critical text-xs font-semibold">
              <Icon name="alert-circle" className="w-4 h-4 inline mr-2" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {summaryCards.map(card => {
              const CardIcon = card.icon;
              return (
                <div key={card.label} className={`${cardClass} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">{card.label}</p>
                      <p className="mt-2 text-[22px] leading-none font-semibold tracking-[-0.02em] text-foreground tabular-nums truncate">{card.value}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground truncate">{card.meta}</p>
                    </div>
                    <div className={`${card.tone} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
                      <CardIcon className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] gap-4">
            <div className="space-y-4">
              <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Plan Workspace</p>
                    <p className="text-[11px] text-muted-foreground">
                      Current plan is derived from `GET /billing/subscriptions`; catalog prices are display-only until checkout is connected.
                    </p>
                  </div>
                  {currentPlan && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold sq-tone-brand">
                      <Icon name="check" className="w-3 h-3" />
                      {currentPlan.name}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  {planCatalog.map(plan => {
                    const isCurrent = plan.aliases.some(alias => alias.toLowerCase() === currentPlanName?.toLowerCase());
                    return (
                      <div key={plan.name} className={`rounded-2xl border border-border/70 bg-card/70 p-4 transition-all ${isCurrent ? 'ring-1 ring-[var(--brand)] shadow-[var(--shadow-2)]' : 'hover:bg-muted/30'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{plan.name}</h3>
                            <p className="mt-1 text-[11px] text-muted-foreground">{plan.desc}</p>
                          </div>
                          <div className={`${plan.tone} w-9 h-9 rounded-xl flex items-center justify-center`}>
                            <Icon name={isCurrent ? 'check-circle-2' : 'credit-card'} className="w-4 h-4" />
                          </div>
                        </div>
                        <div className="mt-4">
                          <span className="text-[26px] leading-none font-semibold tracking-[-0.03em] text-foreground tabular-nums">{plan.price}</span>
                          <span className="block mt-1 text-[11px] text-muted-foreground">pro Fahrzeug / Monat</span>
                        </div>
                        <ul className="mt-4 space-y-2">
                          {plan.features.map(feature => (
                            <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <Icon name="check-circle" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--brand)]" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          disabled
                          title={isCurrent ? 'Aktueller Plan' : 'Planwechsel-Flow ist noch nicht angebunden'}
                          className={`mt-4 w-full py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                            isCurrent
                              ? 'sq-tone-success cursor-default'
                              : 'border border-border/70 bg-muted/40 text-muted-foreground cursor-not-allowed'
                          }`}
                        >
                          {isCurrent ? 'Aktueller Plan' : plan.name === 'Enterprise' ? 'Kontakt über Support' : 'Upgrade vorbereiten'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className={cardClass}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">Subscription Summary</h3>
                    <p className="text-[11px] text-muted-foreground">Live status from tenant billing scope</p>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${subscription ? 'sq-tone-success' : 'sq-tone-warning'}`}>
                    {subscription?.status ?? 'Missing'}
                  </span>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Plan', value: currentPlan?.name ?? subscription?.plan ?? '—' },
                    { label: 'Monthly recurring', value: formatMoney(currentMrr) },
                    { label: 'Current period start', value: formatDateShort(subscription?.currentPeriodStart) },
                    { label: 'Current period end', value: formatDateShort(subscription?.currentPeriodEnd) },
                    { label: 'Subscription ID', value: subscription?.id ?? '—' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/40 last:border-b-0">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <span className="text-xs font-semibold text-foreground text-right truncate">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={cardClass}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">Zahlungsmethode</h3>
                    <p className="text-[11px] text-muted-foreground">Stripe payment method is not exposed by the current tenant endpoint.</p>
                  </div>
                  <span className="px-2 py-1 rounded-lg text-[10px] font-semibold sq-tone-neutral">Not synced</span>
                </div>
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-4 text-center">
                  <div className="sq-tone-neutral w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center">
                    <Icon name="credit-card" className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-foreground">Keine Zahlungsmethode im API-Response</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Die alte Demo-Mastercard wurde entfernt, damit hier keine falschen Zahlungsdaten angezeigt werden.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
              <div>
                <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">Rechnungsverlauf</h3>
                <p className="text-[11px] text-muted-foreground">
                  Showing {filteredInvoices.length} of {invoices.length} invoices · active scope: {activeStatus.label}
                </p>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors text-[var(--brand)] hover:bg-[var(--brand-soft)]"
                >
                  Clear filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-3 mb-4">
              <div className="relative">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={invoiceSearch}
                  onChange={e => setInvoiceSearch(e.target.value)}
                  placeholder="Search invoice ID, Stripe ID or plan..."
                  className={`${inputClass} !pl-9`}
                />
              </div>
              <select
                value={invoiceStatus}
                onChange={e => setInvoiceStatus(e.target.value as typeof invoiceStatus)}
                className={inputClass}
              >
                {statusOptions.map(option => (
                  <option key={option.key} value={option.key}>{option.label} ({option.count})</option>
                ))}
              </select>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-dashed border-border/70 bg-muted/30">
                <div className="sq-tone-neutral w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center">
                  <Icon name="file-text" className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">Keine Rechnungen gefunden</p>
                <p className="text-xs mt-1 text-muted-foreground">
                  {hasActiveFilters ? 'Passe Suche oder Statusfilter an.' : 'Sobald Billing-Rechnungen synchronisiert sind, erscheinen sie hier.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Rechnungs-Nr.</th>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Plan</th>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Datum</th>
                      <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Betrag</th>
                      <th className="text-center px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Status</th>
                      <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map(invoice => {
                      const pdfUrl = invoice.invoicePdfUrl;
                      return (
                        <tr key={invoice.id} className="border-t border-border/50 transition-colors hover:bg-muted/30">
                          <td className="px-3 py-2.5 text-xs font-mono font-medium text-foreground">{invoice.stripeInvoiceId ?? invoice.id}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{invoice.plan ?? currentPlan?.name ?? '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDateShort(invoice.date ?? invoice.invoiceDate)}</td>
                          <td className="px-3 py-2.5 text-xs font-semibold text-right text-foreground">{formatMoney(invoiceAmount(invoice))}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${statusTone(invoice.status)}`}>
                              <Icon name={normalizeStatus(invoice.status) === 'paid' ? 'check' : 'clock'} className="w-3 h-3" /> {statusLabel(invoice.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {pdfUrl ? (
                              <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex p-1.5 rounded-lg transition-colors text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Rechnung herunterladen">
                                <Icon name="download" className="w-5 h-5" />
                              </a>
                            ) : (
                              <span className="inline-flex p-1.5 rounded-lg text-muted-foreground/50" title="Kein PDF hinterlegt">
                                <Icon name="download" className="w-5 h-5" />
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// MAIN SETTINGS VIEW
// ============================================
export function SettingsView({ activeTab: controlledTab = 'company', onTabChange }: SettingsViewProps) {
  const { orgId, hasPermission } = useRentalOrg();
  const activeTab = controlledTab;
  const canWriteDataAuth = hasPermission('data-authorization', 'write');
  const bridgeDark = useDocumentDark();

  return (
    <div className="space-y-5">
      {/* Tab Content */}
      {activeTab === 'account' && <AccountInformationTab />}
      {activeTab === 'company' && <CompanyProfileTab orgId={orgId} />}
      {activeTab === 'fleet-connection' && <FleetConnectionTab />}
      {activeTab === 'users' && <UsersRolesTab isDarkMode={bridgeDark} orgId={orgId} />}
      {activeTab === 'billing' && <BillingTab />}
      {activeTab === 'data-authorization' && <DataAuthorizationTab isDarkMode={bridgeDark} canWrite={canWriteDataAuth} />}
      {activeTab === 'legal-documents' && <LegalDocumentsTab isDarkMode={bridgeDark} />}
    </div>
  );
}