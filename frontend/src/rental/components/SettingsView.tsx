import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Building2, Wifi, MapPin, UserCog, CreditCard, Upload, Trash2, Plus,
  Edit3, Save, X, Search, ChevronDown, Check, Signal, SignalZero,
  Download, ExternalLink, Shield, Crown, Eye, Mail, Phone, Globe,
  Clock, FileText, Image, AlertCircle, CheckCircle, CheckCircle2, XCircle, Users, Zap, Star,
  Database, Lock, ToggleLeft, ToggleRight, Key, ShieldCheck, FileCheck,
  User, Camera, Smartphone, MapPin as MapPinIcon, Car, Loader2, Crosshair, RefreshCw
} from 'lucide-react';
import { getStoredUser } from '../../lib/auth';
import { useRentalOrg } from '../RentalContext';
import { api, type FleetConnectivityResponse, type FleetConnectivityVehicle } from '../../lib/api';
import { isVehicleAtHomeStation } from '../../lib/geospatial';
import { formatOdometerKmFloor } from '../../lib/formatVehicleDisplay';
import { UsersRolesTab } from './UsersRolesTab';
import { DataAuthorizationTab } from './DataAuthorizationTab';

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
  isDarkMode: boolean;
  activeTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
}

type SettingsTab = 'account' | 'company' | 'fleet-connection' | 'users' | 'billing' | 'data-authorization';

// ============================================
// ACCOUNT INFORMATION TAB
// ============================================
function AccountInformationTab({ isDarkMode }: { isDarkMode: boolean }) {
  const storedUser = getStoredUser();
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
      phone: '+49 30 1234567',
      mobile: '+49 170 9876543',
      position: 'Geschäftsführer',
      department: 'Management',
      location: 'Berlin Central',
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

  const cardClass = `rounded-lg p-4 shadow-sm border ${
    isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
  }`;
  const inputClass = `w-full px-3 py-2.5 rounded-lg border text-xs transition-all duration-200 ${
    isDarkMode
      ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20'
      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20'
  } outline-none`;
  const labelClass = `block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  const toggleNotification = (key: keyof typeof accountData.notifications) => {
    setAccountData({
      ...accountData,
      notifications: { ...accountData.notifications, [key]: !accountData.notifications[key] },
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-bold tracking-tight ${textPrimary}`}>Account Information</h2>
          <p className={`text-xs mt-1 ${textSecondary}`}>Verwalten Sie Ihr persönliches Profil und Ihre Einstellungen</p>
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
            isEditing
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25'
              : isDarkMode
                ? 'bg-neutral-800/60 border border-neutral-700/50 text-gray-300 hover:bg-neutral-700/60'
                : 'bg-white/80 border border-gray-200 text-gray-700 hover:bg-white hover:shadow-md'
          }`}
        >
          {isEditing ? <><Save className="w-5 h-5" /> Änderungen speichern</> : <><Edit3 className="w-5 h-5" /> Profil bearbeiten</>}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Left Column — Profile Card & Security */}
        <div className="space-y-5">
          {/* Profile Card */}
          <div className={cardClass}>
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-3">
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-indigo-500/30">
                  {accountInitials}
                </div>
                {isEditing && (
                  <button className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-700 transition-colors">
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              </div>
              <h3 className={`text-base font-bold ${textPrimary}`}>{accountData.firstName} {accountData.lastName}</h3>
              <p className={`text-xs ${textSecondary}`}>{accountData.position}</p>
              <p className={`text-xs mt-0.5 ${textSecondary}`}>{accountData.department}</p>
              <div className={`mt-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                isDarkMode ? 'bg-purple-500/15 text-purple-400' : 'bg-purple-100 text-purple-700'
              }`}>
                <Crown className="w-3 h-3" /> Owner
              </div>
            </div>
            <div className={`mt-5 pt-5 border-t space-y-3 ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-200/60'}`}>
              <div className="flex items-center gap-3">
                <Mail className={`w-5 h-5 ${textSecondary}`} />
                <span className={`text-xs ${textSecondary}`}>{accountData.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className={`w-5 h-5 ${textSecondary}`} />
                <span className={`text-xs ${textSecondary}`}>{accountData.phone}</span>
              </div>
              <div className="flex items-center gap-3">
                <Smartphone className={`w-5 h-5 ${textSecondary}`} />
                <span className={`text-xs ${textSecondary}`}>{accountData.mobile}</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPinIcon className={`w-5 h-5 ${textSecondary}`} />
                <span className={`text-xs ${textSecondary}`}>{accountData.location}</span>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className={cardClass}>
            <h3 className={`text-base font-semibold mb-3 ${textPrimary}`}>Sicherheit</h3>
            <div className="space-y-3">
              <div className={`flex items-center justify-between p-3 rounded-lg border ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700/30' : 'bg-gray-50/80 border-gray-100'}`}>
                <div className="flex items-center gap-3">
                  <Key className={`w-5 h-5 ${textSecondary}`} />
                  <div>
                    <p className={`text-xs font-medium ${textPrimary}`}>Passwort</p>
                    <p className={`text-xs ${textSecondary}`}>Zuletzt geändert vor 45 Tagen</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPasswordChange(!showPasswordChange)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                    isDarkMode ? 'text-blue-400 hover:bg-blue-600/10' : 'text-blue-600 hover:bg-blue-50'
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
              <div className={`flex items-center justify-between p-3 rounded-lg border ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700/30' : 'bg-gray-50/80 border-gray-100'}`}>
                <div className="flex items-center gap-3">
                  <ShieldCheck className={`w-5 h-5 ${textSecondary}`} />
                  <div>
                    <p className={`text-xs font-medium ${textPrimary}`}>Zwei-Faktor-Authentifizierung</p>
                    <p className={`text-xs ${textSecondary}`}>Zusätzliche Sicherheitsebene</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>Aktiv</span>
              </div>
              <div className={`flex items-center justify-between p-3 rounded-lg border ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700/30' : 'bg-gray-50/80 border-gray-100'}`}>
                <div className="flex items-center gap-3">
                  <Clock className={`w-5 h-5 ${textSecondary}`} />
                  <div>
                    <p className={`text-xs font-medium ${textPrimary}`}>Letzte Anmeldung</p>
                    <p className={`text-xs ${textSecondary}`}>07.03.2026, 09:14 · Berlin, DE</p>
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
            <h3 className={`text-base font-semibold mb-3 ${textPrimary}`}>Persönliche Informationen</h3>
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
            <h3 className={`text-base font-semibold mb-3 ${textPrimary}`}>Einstellungen</h3>
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
            <h3 className={`text-base font-semibold mb-3 ${textPrimary}`}>Benachrichtigungen</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { key: 'email' as const, label: 'E-Mail-Benachrichtigungen', desc: 'Wichtige Updates per E-Mail erhalten' },
                { key: 'push' as const, label: 'Push-Benachrichtigungen', desc: 'Desktop-Benachrichtigungen im Browser' },
                { key: 'sms' as const, label: 'SMS-Benachrichtigungen', desc: 'Kritische Alerts per SMS' },
                { key: 'weeklyReport' as const, label: 'Wöchentlicher Report', desc: 'Zusammenfassung jeden Montag' },
                { key: 'bookingAlerts' as const, label: 'Buchungs-Alerts', desc: 'Neue Buchungen und Stornierungen' },
                { key: 'maintenanceAlerts' as const, label: 'Wartungs-Alerts', desc: 'Anstehende Wartungstermine' },
              ].map((item) => (
                <div key={item.key} className={`flex items-center justify-between p-3 rounded-lg border ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700/30' : 'bg-gray-50/80 border-gray-100'}`}>
                  <div>
                    <p className={`text-xs font-medium ${textPrimary}`}>{item.label}</p>
                    <p className={`text-xs ${textSecondary}`}>{item.desc}</p>
                  </div>
                  <button
                    onClick={() => toggleNotification(item.key)}
                    className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${
                      accountData.notifications[item.key]
                        ? 'bg-blue-600'
                        : isDarkMode ? 'bg-neutral-700' : 'bg-gray-300'
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
              <h3 className={`text-base font-semibold ${textPrimary}`}>Aktive Sitzungen</h3>
              <button className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors text-red-500 hover:bg-red-50 ${isDarkMode ? 'hover:bg-red-500/10' : ''}`}>
                Alle anderen abmelden
              </button>
            </div>
            <div className="space-y-2">
              {[
                { device: 'MacBook Pro – Chrome', location: 'Berlin, DE', time: 'Aktuelle Sitzung', current: true },
                { device: 'iPhone 15 Pro – Safari', location: 'Berlin, DE', time: 'Vor 2 Stunden', current: false },
                { device: 'iPad Air – Safari', location: 'München, DE', time: 'Vor 3 Tagen', current: false },
              ].map((session, i) => (
                <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700/30' : 'bg-gray-50/80 border-gray-100'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-neutral-700/50' : 'bg-gray-100'}`}>
                      <Globe className={`w-5 h-5 ${textSecondary}`} />
                    </div>
                    <div>
                      <p className={`text-xs font-medium ${textPrimary}`}>{session.device}</p>
                      <p className={`text-xs ${textSecondary}`}>{session.location} · {session.time}</p>
                    </div>
                  </div>
                  {session.current ? (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>Aktuell</span>
                  ) : (
                    <button className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-500 hover:bg-neutral-700' : 'text-gray-400 hover:bg-gray-100'}`}>
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

function CompanyProfileTab({ isDarkMode, orgId }: { isDarkMode: boolean; orgId?: string }) {
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

  const cardClass = `rounded-lg p-4 shadow-sm border ${
    isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
  }`;
  const inputClass = `w-full px-3 py-2.5 rounded-lg border text-xs transition-all duration-200 ${
    isDarkMode
      ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20'
      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20'
  } outline-none`;
  const inputClassView = `${inputClass} ${!isEditing ? 'cursor-default opacity-90' : ''}`;
  const labelClass = `block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  const businessDocuments: Array<{ name: string; size: string; date: string }> = [];

  const primaryButtonDisabled =
    !canEditProfile || saving || (!isEditing && loading) || (!orgId?.trim());
  const primaryButtonLabel = saving
    ? 'Speichern…'
    : isEditing
      ? 'Save Changes'
      : 'Edit Profile';
  const primaryButtonIcon = saving ? (
    <Loader2 className="w-5 h-5 animate-spin" />
  ) : isEditing ? (
    <Save className="w-5 h-5" />
  ) : (
    <Edit3 className="w-5 h-5" />
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={`text-lg font-bold tracking-tight ${textPrimary}`}>Company Profile</h2>
          <p className={`text-xs mt-1 ${textSecondary}`}>Verwalten Sie Ihre Unternehmensdaten und Dokumente</p>
          {loading && (
            <p className={`text-xs mt-1 ${textSecondary} flex items-center gap-1.5`}>
              <Loader2 className="w-3 h-3 animate-spin" /> Profil wird geladen…
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
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
            primaryButtonDisabled ? 'opacity-50 cursor-not-allowed ' : ''
          }${
            isEditing
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25'
              : isDarkMode
                ? 'bg-neutral-800/60 border border-neutral-700/50 text-gray-300 hover:bg-neutral-700/60'
                : 'bg-white/80 border border-gray-200 text-gray-700 hover:bg-white hover:shadow-md'
          }`}
        >
          {primaryButtonIcon} {primaryButtonLabel}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Company Information */}
        <div className={`lg:col-span-2 ${cardClass}`}>
          <h3 className={`text-base font-semibold mb-3 ${textPrimary}`}>Unternehmensinformationen</h3>
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
          <div className={`mt-6 pt-6 border-t ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-200/60'}`}>
            <h4 className={`text-xs font-semibold mb-3 ${textPrimary}`}>Geschäftsführer / Ansprechpartner</h4>
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
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-base font-semibold ${textPrimary}`}>Firmenlogo</h3>
              {logoUrl && canEditProfile && (
                <button
                  type="button"
                  onClick={handleLogoRemove}
                  disabled={logoUploading}
                  className={`p-1.5 rounded-lg transition-colors ${
                    logoUploading
                      ? 'opacity-50 cursor-not-allowed'
                      : isDarkMode
                        ? 'text-gray-400 hover:text-red-400 hover:bg-red-500/10'
                        : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                  }`}
                  title="Logo entfernen"
                  aria-label="Logo entfernen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
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
              className={`border-2 border-dashed rounded-lg p-6 text-center ${
                isDarkMode ? 'border-neutral-700/50 bg-neutral-800/30' : 'border-gray-200 bg-gray-50/50'
              }`}
            >
              <div
                className={`w-20 h-20 mx-auto mb-3 rounded-lg flex items-center justify-center overflow-hidden ${
                  isDarkMode ? 'bg-neutral-700/50' : 'bg-gray-100'
                }`}
              >
                {logoUrl && !logoBroken ? (
                  <img
                    src={logoUrl}
                    alt="Firmenlogo"
                    className="w-full h-full object-contain"
                    onError={() => setLogoBroken(true)}
                  />
                ) : (
                  <Image className={`w-5 h-5 ${textSecondary}`} />
                )}
              </div>
              <p className={`text-xs font-medium mb-1 ${textPrimary}`}>
                {logoUrl ? 'Logo aktualisieren' : 'Logo hochladen'}
              </p>
              <p className={`text-xs ${textSecondary}`}>PNG, JPG, SVG oder WebP bis 2 MB</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canEditProfile || logoUploading || !orgId?.trim()}
                className={`mt-3 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  !canEditProfile || logoUploading || !orgId?.trim()
                    ? 'opacity-50 cursor-not-allowed bg-blue-600 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {logoUploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Lädt hoch…
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" /> Datei auswählen
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
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-base font-semibold ${textPrimary}`}>Dokumente</h3>
              <button className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className={`text-xs mb-3 ${textSecondary}`}>Geschäftsdokumente die Kunden bei der Buchungsbestätigung angezeigt werden.</p>
            {businessDocuments.length === 0 ? (
              <p className={`text-xs py-6 text-center rounded-lg border border-dashed ${
                isDarkMode ? 'border-neutral-700/50 text-gray-500 bg-neutral-800/20' : 'border-gray-200 text-gray-500 bg-gray-50/50'
              }`}>
                Noch keine Dokumente hinterlegt.
              </p>
            ) : (
              <div className="space-y-2">
                {businessDocuments.map((doc, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${
                    isDarkMode ? 'bg-neutral-800/40 border-neutral-700/30' : 'bg-gray-50/80 border-gray-100'
                  }`}>
                    <FileText className={`w-5 h-5 flex-shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${textPrimary}`}>{doc.name}</p>
                      <p className={`text-xs ${textSecondary}`}>{doc.size} · {doc.date}</p>
                    </div>
                    <button type="button" className={`p-1 rounded-lg hover:bg-red-100 hover:text-red-500 transition-colors ${textSecondary}`}>
                      <Trash2 className="w-3.5 h-3.5" />
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

function StatusDot({ status, isDarkMode }: { status: FleetConnectivityVehicle['connectionStatus']; isDarkMode: boolean }) {
  const cfg = {
    online:        { color: 'bg-emerald-500', pulse: true,  label: 'Online',        badge: isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700' },
    standby:       { color: 'bg-amber-500',   pulse: false, label: 'Standby',       badge: isDarkMode ? 'bg-amber-500/15 text-amber-400'     : 'bg-amber-50 text-amber-700' },
    offline:       { color: 'bg-red-500',     pulse: false, label: 'Offline',       badge: isDarkMode ? 'bg-red-500/15 text-red-400'         : 'bg-red-50 text-red-700' },
    not_connected: { color: 'bg-gray-400',    pulse: false, label: 'Not Connected', badge: isDarkMode ? 'bg-gray-500/15 text-gray-400'       : 'bg-gray-100 text-gray-500' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

function FleetConnectionTab({ isDarkMode }: { isDarkMode: boolean }) {
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

  const cardClass = `rounded-lg p-4 shadow-sm border ${
    isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
  }`;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const textMuted = isDarkMode ? 'text-gray-500' : 'text-gray-400';

  const vehicles = useMemo(() => {
    if (!data) return [];
    let list = data.vehicles;
    if (statusFilter !== 'all') list = list.filter(v => v.connectionStatus === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className={`w-8 h-8 border-2 border-t-transparent rounded-full animate-spin ${isDarkMode ? 'border-blue-400' : 'border-blue-500'}`} />
        <p className={`text-xs mt-3 ${textSecondary}`}>Loading fleet connectivity...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <AlertCircle className={`w-10 h-10 mb-3 ${isDarkMode ? 'text-red-400' : 'text-red-500'}`} />
        <p className={`text-sm font-semibold ${textPrimary}`}>Could not load connectivity data</p>
        <p className={`text-xs mt-1 ${textSecondary}`}>Check your connection or try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className={`text-lg font-bold tracking-tight ${textPrimary}`}>Fleet Connectivity</h2>
        <p className={`text-xs mt-0.5 ${textSecondary}`}>Vehicle connection status, data sources, and device mapping</p>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Vehicles', value: s?.total ?? 0, icon: Car, colorClass: isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600' },
          { label: 'Online', value: s?.online ?? 0, icon: Signal, colorClass: isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600' },
          { label: 'Standby', value: s?.standby ?? 0, icon: Clock, colorClass: isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600' },
          { label: 'Offline', value: s?.offline ?? 0, icon: SignalZero, colorClass: isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600' },
          { label: 'Not Connected', value: s?.notConnected ?? 0, icon: Wifi, colorClass: isDarkMode ? 'bg-gray-500/15 text-gray-400' : 'bg-gray-100 text-gray-500' },
        ].map(stat => (
          <div key={stat.label} className={cardClass}>
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${stat.colorClass}`}>
                <stat.icon className="w-4 h-4" />
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-wider font-semibold ${textMuted}`}>{stat.label}</p>
                <p className={`text-lg font-bold ${textPrimary}`}>{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${textMuted}`} />
          <input
            type="text"
            placeholder="Search VIN, plate, make, model, serial..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 rounded-lg text-xs border outline-none transition-all ${
              isDarkMode
                ? 'bg-neutral-800/60 border-neutral-700/50 text-white placeholder-gray-500 focus:border-blue-500/50'
                : 'bg-white/80 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400'
            }`}
          />
        </div>
        <div className="flex gap-1.5">
          {([['all', 'All'], ['online', 'Online'], ['standby', 'Standby'], ['offline', 'Offline'], ['not_connected', 'No Connection']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isDarkMode ? 'bg-neutral-800/60 text-gray-400 hover:text-white' : 'bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Vehicle List */}
      {vehicles.length === 0 ? (
        <div className={`${cardClass} flex flex-col items-center justify-center py-14 px-6 text-center border-dashed ${
          isDarkMode ? '!border-neutral-600/60' : '!border-gray-300/80'
        }`}>
          <div className={`p-3 rounded-full mb-3 ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`}>
            <Car className={`w-8 h-8 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
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
            return (
              <div key={v.vehicleId} className={`${cardClass} transition-all duration-200 hover:shadow-lg cursor-pointer`} onClick={() => setExpandedId(isExpanded ? null : v.vehicleId)}>
                {/* Compact row */}
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    v.connectionStatus === 'online' ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                    : v.connectionStatus === 'standby' ? (isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600')
                    : v.connectionStatus === 'offline' ? (isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600')
                    : (isDarkMode ? 'bg-gray-500/15 text-gray-400' : 'bg-gray-100 text-gray-400')
                  }`}>
                    <ConnIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-semibold truncate ${textPrimary}`}>{v.make} {v.model} {v.year ?? ''}</p>
                      {v.licensePlate && <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${isDarkMode ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>{v.licensePlate}</span>}
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
                        v.freshnessLabel === 'Live' ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-600')
                        : v.freshnessLabel === 'Unknown' ? textMuted
                        : textPrimary
                      }`}>{v.freshnessLabel}</p>
                    </div>
                    <StatusDot status={v.connectionStatus} isDarkMode={isDarkMode} />
                    <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''} ${textMuted}`} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className={`mt-4 pt-4 border-t ${isDarkMode ? 'border-neutral-700/50' : 'border-gray-200/50'}`} onClick={e => e.stopPropagation()}>
                    {/* Status Interpretation */}
                    <div className={`flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg text-xs ${
                      v.connectionStatus === 'online' ? (isDarkMode ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-50 text-emerald-700')
                      : v.connectionStatus === 'standby' ? (isDarkMode ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-700')
                      : v.connectionStatus === 'offline' ? (isDarkMode ? 'bg-red-500/10 text-red-300' : 'bg-red-50 text-red-700')
                      : (isDarkMode ? 'bg-gray-500/10 text-gray-400' : 'bg-gray-50 text-gray-600')
                    }`}>
                      <StatusDot status={v.connectionStatus} isDarkMode={isDarkMode} />
                      <span className="mt-0.5">{v.statusNote}</span>
                    </div>

                    <div className={`mb-4 rounded-xl border px-3 py-3 space-y-3 ${isDarkMode ? 'border-neutral-700/50 bg-neutral-800/40' : 'border-gray-200/60 bg-gray-50/80'}`}>
                      <p className={`text-[10px] uppercase tracking-wider font-bold ${textMuted}`}>OBD & cellular</p>
                      <div className="flex items-center gap-2">
                        {v.obdIsPluggedIn === true && <><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /><span className={`text-xs font-medium ${textPrimary}`}>OBD Device Plugged IN</span></>}
                        {v.obdIsPluggedIn === false && <><XCircle className="w-4 h-4 text-red-500 shrink-0" /><span className={`text-xs font-medium ${textPrimary}`}>OBD Device Plugged IN</span></>}
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
                            <ChevronDown className={`w-3.5 h-3.5 ${textMuted} transition-transform ${jammingOpenId === v.vehicleId ? 'rotate-180' : ''}`} />
                          )}
                        </button>
                        {jammingOpenId === v.vehicleId && (v.jammingDetectedCount ?? 0) > 0 && (
                          <ul className={`mt-2 space-y-2 pl-3 border-l-2 ${isDarkMode ? 'border-amber-500/40' : 'border-amber-200'}`}>
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

export function StationsTab({ isDarkMode }: { isDarkMode: boolean }) {
  const { orgId } = useRentalOrg();

  const [stations, setStations] = useState<import('../../lib/api').Station[]>([]);
  const [stats, setStats] = useState<import('../../lib/api').StationsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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
  const cardClass = `rounded-xl p-4 shadow-sm border ${
    isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
  }`;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-3 py-2.5 rounded-lg border text-xs transition-all duration-200 ${
    isDarkMode
      ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20'
      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20'
  } outline-none`;
  const labelClass = `block text-[11px] font-semibold mb-1.5 uppercase tracking-wider ${
    isDarkMode ? 'text-gray-400' : 'text-gray-500'
  }`;

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
    if (!q) return stations;
    return stations.filter((s) => {
      const haystack = [s.name, s.city, s.address, s.managerName, s.phone, s.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [stations, search]);

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
  const unassigned = stats?.unassignedVehicles ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className={`text-lg font-bold tracking-tight ${textPrimary}`}>
            Stations &amp; Branches
          </h2>
          <p className={`text-xs mt-1 ${textSecondary}`}>
            {totalStations} Standorte · {activeStations} aktiv · {totalVehicles} Fahrzeuge zugewiesen
            {unassigned > 0 && (
              <>
                {' · '}
                <span className="text-amber-500 font-medium">
                  {unassigned} ohne Station
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
            <input
              type="text"
              placeholder="Suche nach Name, Stadt, Manager…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`pl-9 pr-3 py-2.5 rounded-lg border text-xs w-60 transition-all duration-200 ${
                isDarkMode
                  ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20'
                  : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20'
              } outline-none`}
            />
          </div>
          {stationsMissingCoords > 0 && (
            <button
              type="button"
              onClick={runBackfill}
              disabled={backfillRunning}
              title={`${stationsMissingCoords} Station${stationsMissingCoords === 1 ? '' : 'en'} ohne Koordinaten — jetzt automatisch über Mapbox geocodieren`}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                isDarkMode
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-200 hover:bg-amber-500/15'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              }`}
            >
              {backfillRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Koordinaten nachziehen ({stationsMissingCoords})
            </button>
          )}
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-3 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25"
          >
            <Plus className="w-4 h-4" /> Standort hinzufügen
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
              ? isDarkMode
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-red-50 border-red-200'
              : isDarkMode
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-emerald-50 border-emerald-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {backfillError ? (
                <>
                  <p className={`text-xs font-semibold ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>
                    Geocoding fehlgeschlagen
                  </p>
                  <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-red-300/80' : 'text-red-600/90'}`}>
                    {backfillError}
                  </p>
                </>
              ) : backfillResult ? (
                <>
                  <p className={`text-xs font-semibold ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                    Backfill abgeschlossen — {backfillResult.totalGeocoded} geocodiert
                    {backfillResult.totalFailed > 0 && `, ${backfillResult.totalFailed} fehlgeschlagen`}
                    {backfillResult.totalSkipped > 0 && `, ${backfillResult.totalSkipped} übersprungen`}
                  </p>
                  {backfillResult.results.length > 0 && (
                    <ul className={`mt-1.5 space-y-0.5 text-[10.5px] ${isDarkMode ? 'text-emerald-200/85' : 'text-emerald-700/90'}`}>
                      {backfillResult.results.slice(0, 8).map((r) => (
                        <li key={r.stationId} className="flex items-center gap-2">
                          {r.status === 'geocoded' && <CheckCircle className="w-3 h-3 shrink-0" />}
                          {r.status === 'failed' && <XCircle className="w-3 h-3 shrink-0 text-red-400" />}
                          {r.status === 'skipped' && <AlertCircle className="w-3 h-3 shrink-0 text-amber-400" />}
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
              className={`p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}
              aria-label="Hinweis schließen"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Stats strip */}
      {!loading && stations.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StationStatPill
            icon={<MapPin className="w-4 h-4" />}
            label="Standorte"
            value={totalStations}
            isDarkMode={isDarkMode}
            accent="blue"
          />
          <StationStatPill
            icon={<CheckCircle className="w-4 h-4" />}
            label="Aktiv"
            value={activeStations}
            isDarkMode={isDarkMode}
            accent="emerald"
          />
          <StationStatPill
            icon={<Car className="w-4 h-4" />}
            label="Fahrzeuge zugewiesen"
            value={totalVehicles}
            isDarkMode={isDarkMode}
            accent="violet"
          />
          <StationStatPill
            icon={<AlertCircle className="w-4 h-4" />}
            label="Ohne Station"
            value={unassigned}
            isDarkMode={isDarkMode}
            accent={unassigned > 0 ? 'amber' : 'gray'}
          />
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${
            isDarkMode
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
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
          <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
          <span className={`text-xs ${textSecondary}`}>Standorte werden geladen…</span>
        </div>
      ) : stations.length === 0 ? (
        // Empty state
        <div
          className={`${cardClass} flex flex-col items-center justify-center py-16 px-6 text-center border-dashed ${
            isDarkMode ? 'border-neutral-600/60' : 'border-gray-300/80'
          }`}
        >
          <div className={`p-4 rounded-full mb-3 ${isDarkMode ? 'bg-neutral-800/80' : 'bg-gray-100'}`}>
            <MapPin className={`w-10 h-10 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
          </div>
          <p className={`text-sm font-semibold ${textPrimary}`}>Noch keine Standorte</p>
          <p className={`text-xs mt-1 max-w-sm ${textSecondary}`}>
            Legen Sie Ihren ersten Standort an, um Fahrzeuge und Benutzer geografisch zuzuordnen.
          </p>
          <button
            onClick={openCreate}
            className="mt-4 flex items-center gap-2 px-3 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25"
          >
            <Plus className="w-4 h-4" /> Standort hinzufügen
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
              isDarkMode={isDarkMode}
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
              isDarkMode ? 'bg-neutral-900 border border-neutral-700' : 'bg-white border border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
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
                  isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'
                }`}
              >
                <X className={`w-5 h-5 ${textSecondary}`} />
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
                      isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'
                    }`}
                  >
                    {suggestLoading ? (
                      <div className={`px-3 py-2.5 text-xs flex items-center gap-2 ${textSecondary}`}>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Suche Standorte…
                      </div>
                    ) : (
                      suggestions.map((s) => (
                        <button
                          key={s.placeId}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickSuggestion(s)}
                          className={`w-full text-left px-3 py-2.5 text-xs border-b last:border-b-0 transition-colors ${
                            isDarkMode
                              ? 'border-neutral-700 hover:bg-neutral-700/60 text-gray-200'
                              : 'border-gray-100 hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <div className="font-medium flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-blue-500" /> {s.mainText}
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
                className={`rounded-xl border p-3.5 ${
                  isDarkMode
                    ? 'bg-neutral-900/40 border-neutral-700'
                    : 'bg-gray-50/60 border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 ${
                      isDarkMode ? 'bg-neutral-800 text-gray-300' : 'bg-white text-gray-600'
                    }`}
                  >
                    <MapPinIcon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <label className={`block text-[11px] font-semibold uppercase tracking-wider ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-800'
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
                className={`rounded-xl border p-3.5 ${
                  isDarkMode
                    ? 'bg-blue-500/5 border-blue-500/25'
                    : 'bg-blue-50/40 border-blue-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        isDarkMode ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-100 text-blue-600'
                      }`}
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <label className={`block text-[11px] font-semibold uppercase tracking-wider ${
                        isDarkMode ? 'text-gray-200' : 'text-gray-800'
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
                        isDarkMode
                          ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20'
                          : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20'
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
                          ? isDarkMode ? 'bg-blue-500/30 text-blue-200' : 'bg-blue-100 text-blue-700'
                          : isDarkMode ? 'bg-neutral-800 text-gray-400 hover:bg-neutral-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Parkplatz · 100m
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, radiusMeters: 250 })}
                      className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${
                        form.radiusMeters === 250
                          ? isDarkMode ? 'bg-blue-500/30 text-blue-200' : 'bg-blue-100 text-blue-700'
                          : isDarkMode ? 'bg-neutral-800 text-gray-400 hover:bg-neutral-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Filiale · 250m
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, radiusMeters: 1000 })}
                      className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${
                        form.radiusMeters === 1000
                          ? isDarkMode ? 'bg-blue-500/30 text-blue-200' : 'bg-blue-100 text-blue-700'
                          : isDarkMode ? 'bg-neutral-800 text-gray-400 hover:bg-neutral-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                      isDarkMode ? 'text-amber-300' : 'text-amber-700'
                    }`}
                  >
                    <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
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
                            : isDarkMode
                              ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700/60'
                              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
                    isDarkMode
                      ? 'bg-red-500/10 border-red-500/30 text-red-300'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  <AlertCircle className="w-4 h-4" />
                  {formError}
                </div>
              )}
            </div>

            <div
              className={`sticky bottom-0 flex items-center justify-end gap-2 px-5 py-4 border-t ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}
            >
              <button
                onClick={closeModal}
                disabled={saving}
                className={`px-4 py-2.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                  isDarkMode
                    ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700/60'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
                    <Loader2 className="w-4 h-4 animate-spin" /> Speichere…
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
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
              isDarkMode ? 'bg-neutral-900 border border-neutral-700' : 'bg-white border border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className={`p-2.5 rounded-lg ${isDarkMode ? 'bg-red-500/15' : 'bg-red-50'}`}>
                <AlertCircle className="w-5 h-5 text-red-500" />
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
                  isDarkMode
                    ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700/60'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
                    <Loader2 className="w-4 h-4 animate-spin" /> Lösche…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" /> Löschen
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
              isDarkMode ? 'bg-neutral-900 border border-neutral-700' : 'bg-white border border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className={`flex items-start justify-between px-5 py-4 border-b ${
                isDarkMode ? 'border-neutral-700' : 'border-gray-200'
              }`}
            >
              <div className="min-w-0">
                <h3 className={`text-base font-semibold flex items-center gap-2 ${textPrimary}`}>
                  <Car className="w-4 h-4 text-blue-500" />
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
                  isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-100'
                }`}
              >
                <X className={`w-5 h-5 ${textSecondary}`} />
              </button>
            </div>

            {/* Filter / search bar */}
            <div
              className={`px-5 py-3 border-b flex flex-wrap items-center gap-2 ${
                isDarkMode ? 'border-neutral-700' : 'border-gray-200'
              }`}
            >
              <div className="relative flex-1 min-w-[220px]">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
                <input
                  type="text"
                  placeholder="Suche nach Kennzeichen, Modell, Standort…"
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 rounded-lg border text-xs transition-all duration-200 ${
                    isDarkMode
                      ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20'
                      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20'
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
                          : isDarkMode
                            ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700/60'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
                  <span className="text-xs">Fahrzeuge werden geladen…</span>
                </div>
              ) : assignError ? (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${
                    isDarkMode
                      ? 'bg-red-500/10 border-red-500/30 text-red-300'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  <AlertCircle className="w-4 h-4" /> {assignError}
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
                            ? isDarkMode
                              ? 'bg-blue-500/10 border-blue-500/40'
                              : 'bg-blue-50 border-blue-200'
                            : isDarkMode
                              ? 'bg-neutral-800/40 border-neutral-700 hover:bg-neutral-800'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignVehicle(v.id)}
                          className="w-4 h-4 accent-blue-600 cursor-pointer shrink-0"
                        />
                        <div className={`p-1.5 rounded-lg shrink-0 ${
                          isDarkMode ? 'bg-neutral-700/60' : 'bg-gray-100'
                        }`}>
                          <Car className={`w-3.5 h-3.5 ${textSecondary}`} />
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
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold ${
                                  isDarkMode
                                    ? 'bg-amber-500/15 text-amber-300'
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                ohne Station
                              </span>
                            ) : v.stationId === assignStation.id ? (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold ${
                                  isDarkMode
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                <CheckCircle className="w-2.5 h-2.5" />
                                {assignStation.name}
                              </span>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold ${
                                  isDarkMode
                                    ? 'bg-neutral-700/60 text-gray-300'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                <MapPin className="w-2.5 h-2.5" />
                                {v.stationName ?? 'Andere'}
                              </span>
                            )}
                            {atHome === true && (
                              <span
                                title={`GPS-Position im ${assignStation.radiusMeters}m-Radius dieser Station`}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold ${
                                  isDarkMode
                                    ? 'bg-blue-500/15 text-blue-300'
                                    : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                <Crosshair className="w-2.5 h-2.5" />
                                vor Ort
                              </span>
                            )}
                          </div>
                        </div>
                        {willMove && (
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${
                              isDarkMode ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            Wird verschoben
                          </span>
                        )}
                        {willDetach && (
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${
                              isDarkMode ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'
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
                isDarkMode ? 'border-neutral-700' : 'border-gray-200'
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
                    isDarkMode
                      ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700/60'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
                      <Loader2 className="w-4 h-4 animate-spin" /> Speichere…
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Zuweisung speichern
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
  isDarkMode,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  isDarkMode: boolean;
  accent: 'blue' | 'emerald' | 'violet' | 'amber' | 'gray';
}) {
  const accentMap = {
    blue: isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600',
    emerald: isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600',
    violet: isDarkMode ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-50 text-violet-600',
    amber: isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600',
    gray: isDarkMode ? 'bg-neutral-700/40 text-gray-400' : 'bg-gray-100 text-gray-500',
  } as const;
  return (
    <div
      className={`rounded-xl p-3.5 border flex items-center gap-3 ${
        isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
      }`}
    >
      <div className={`p-2 rounded-lg ${accentMap[accent]}`}>{icon}</div>
      <div>
        <div className={`text-[11px] font-medium uppercase tracking-wider ${
          isDarkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          {label}
        </div>
        <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

function StationCard({
  station,
  isDarkMode,
  onEdit,
  onDelete,
  onToggleStatus,
  onAssign,
  toggling,
}: {
  station: import('../../lib/api').Station;
  isDarkMode: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onAssign: () => void;
  toggling: boolean;
}) {
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const cardClass = `rounded-xl p-4 shadow-sm border ${
    isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
  }`;

  const isActive = station.status === 'ACTIVE';
  const addressLine = [station.address, station.postalCode, station.city]
    .filter(Boolean)
    .join(', ');

  return (
    <div className={`${cardClass} hover:shadow-lg transition-all duration-300`}>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: identity */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`p-3 rounded-lg shrink-0 ${isDarkMode ? 'bg-blue-600/15' : 'bg-blue-50'}`}>
            <MapPin className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-sm font-semibold truncate ${textPrimary}`}>{station.name}</h3>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  isActive
                    ? isDarkMode
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-emerald-100/80 text-emerald-700'
                    : isDarkMode
                      ? 'bg-neutral-700/50 text-gray-400'
                      : 'bg-gray-100 text-gray-600'
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
                  <Clock className="w-3 h-3" /> {station.openingHours}
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
                      : isDarkMode ? 'text-amber-300/90' : 'text-amber-700/90'
                  }`}
                >
                  <Crosshair className="w-3 h-3" />
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
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors mr-1 ${
              isDarkMode
                ? 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/25'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            <Car className="w-3.5 h-3.5" /> Fahrzeuge zuweisen
          </button>
          <button
            onClick={onToggleStatus}
            disabled={toggling}
            title={isActive ? 'Deaktivieren' : 'Aktivieren'}
            className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
              isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-gray-100'
            }`}
          >
            {toggling ? (
              <Loader2 className={`w-4 h-4 animate-spin ${textSecondary}`} />
            ) : isActive ? (
              <ToggleRight className={`w-5 h-5 text-emerald-500`} />
            ) : (
              <ToggleLeft className={`w-5 h-5 ${textSecondary}`} />
            )}
          </button>
          <button
            onClick={onEdit}
            title="Bearbeiten"
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-gray-100'
            }`}
          >
            <Edit3 className={`w-4 h-4 ${textSecondary}`} />
          </button>
          <button
            onClick={onDelete}
            title="Löschen"
            className="p-2 rounded-lg hover:bg-red-100 hover:text-red-500 transition-colors"
          >
            <Trash2 className={`w-4 h-4 ${textSecondary}`} />
          </button>
        </div>
      </div>

      {station.notes && (
        <p
          className={`text-[11px] mt-3 pt-3 border-t italic ${
            isDarkMode ? 'border-neutral-700 text-gray-400' : 'border-gray-100 text-gray-500'
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
function BillingTab({ isDarkMode }: { isDarkMode: boolean }) {
  const cardClass = `rounded-lg p-4 shadow-sm border ${
    isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
  }`;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  const invoices = [
    { id: 'INV-2026-006', date: '01.02.2026', amount: '€249,00', status: 'Bezahlt', period: 'Februar 2026' },
    { id: 'INV-2026-005', date: '01.01.2026', amount: '€249,00', status: 'Bezahlt', period: 'Januar 2026' },
    { id: 'INV-2025-012', date: '01.12.2025', amount: '€249,00', status: 'Bezahlt', period: 'Dezember 2025' },
    { id: 'INV-2025-011', date: '01.11.2025', amount: '€199,00', status: 'Bezahlt', period: 'November 2025' },
    { id: 'INV-2025-010', date: '01.10.2025', amount: '€199,00', status: 'Bezahlt', period: 'Oktober 2025' },
    { id: 'INV-2025-009', date: '01.09.2025', amount: '€199,00', status: 'Bezahlt', period: 'September 2025' },
  ];

  const plans = [
    { name: 'Starter', price: '€99', desc: 'Bis 5 Fahrzeuge', features: ['5 Fahrzeuge', '2 Benutzer', 'Basis-Telematik', 'E-Mail Support'], current: false },
    { name: 'Professional', price: '€249', desc: 'Bis 25 Fahrzeuge', features: ['25 Fahrzeuge', '10 Benutzer', 'Erweiterte Telematik', 'AI Insights', 'Prioritäts-Support', 'API Zugang'], current: true },
    { name: 'Enterprise', price: 'Individuell', desc: 'Unbegrenzt', features: ['Unbegrenzte Fahrzeuge', 'Unbegrenzte Benutzer', 'Premium Telematik', 'AI Fleet Assistant', 'Dedizierter Support', 'Custom Integrationen', 'SLA Garantie'], current: false },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className={`text-lg font-bold tracking-tight ${textPrimary}`}>Billing & Subscriptions</h2>
        <p className={`text-xs mt-1 ${textSecondary}`}>Ihr aktuelles Abo, Zahlungsmethode und Rechnungsverlauf</p>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { name: 'Starter', price: '€24,99', desc: 'Bis 4 Fahrzeuge', features: ['Bis 4 Fahrzeuge', '2 Benutzer', 'Basis-Telematik', 'E-Mail Support'], current: false },
          { name: 'Professional', price: '€20,99', desc: 'Bis 12 Fahrzeuge', features: ['Bis 12 Fahrzeuge', '10 Benutzer', 'Erweiterte Telematik', 'AI Insights', 'Prioritäts-Support', 'API Zugang'], current: true },
          { name: 'Enterprise', price: '€18,99', desc: 'Ab 12+ Fahrzeuge', features: ['Ab 12+ Fahrzeuge', 'Unbegrenzte Benutzer', 'Premium Telematik', 'AI Fleet Assistant', 'Dedizierter Support', 'Custom Integrationen'], current: false },
        ].map((plan) => (
          <div key={plan.name} className={`${cardClass} relative ${plan.current ? 'ring-2 ring-blue-500/50 !border-blue-400/50' : ''}`}>
            {plan.current && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">
                Aktueller Plan
              </div>
            )}
            <div className="text-center mb-3 pt-2">
              <h3 className={`text-base font-bold ${textPrimary}`}>{plan.name}</h3>
              <div className={`mt-2 ${plan.current ? 'text-blue-600' : textPrimary}`}>
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className={`text-xs font-normal ${textSecondary} block mt-0.5`}>pro Fahrzeug / Monat</span>
              </div>
              <p className={`text-xs mt-3 ${textSecondary}`}>{plan.desc}</p>
            </div>
            <ul className="space-y-2 mb-3">
              {plan.features.map((f) => (
                <li key={f} className={`flex items-center gap-2 text-xs ${textSecondary}`}>
                  <CheckCircle className={`w-3.5 h-3.5 flex-shrink-0 ${plan.current ? 'text-blue-500' : 'text-emerald-500'}`} />
                  {f}
                </li>
              ))}
            </ul>
            <button className={`w-full py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              plan.current
                ? isDarkMode ? 'bg-neutral-800 text-gray-400 cursor-default' : 'bg-gray-100 text-gray-400 cursor-default'
                : plan.name === 'Enterprise'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 shadow-lg shadow-purple-500/25'
                  : isDarkMode
                    ? 'bg-neutral-800 border border-neutral-700 text-gray-300 hover:bg-neutral-700'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:shadow-md'
            }`}>
              {plan.current ? 'Aktueller Plan' : plan.name === 'Enterprise' ? 'Kontakt aufnehmen' : 'Upgraden'}
            </button>
          </div>
        ))}
      </div>

      {/* Payment Method & Next Invoice */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Payment Method */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-base font-semibold ${textPrimary}`}>Zahlungsmethode</h3>
            <button className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              isDarkMode ? 'text-blue-400 hover:bg-blue-600/10' : 'text-blue-600 hover:bg-blue-50'
            }`}>Ändern</button>
          </div>
          <div className={`flex items-center gap-3 p-4 rounded-lg border ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700/40' : 'bg-gray-50/80 border-gray-100'}`}>
            <div className="w-14 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">MC</span>
            </div>
            <div className="flex-1">
              <p className={`text-xs font-semibold ${textPrimary}`}>Mastercard ···· 4829</p>
              <p className={`text-xs ${textSecondary}`}>Gültig bis 08/2028</p>
            </div>
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          </div>
          <div className={`mt-4 flex items-center gap-3 p-3 rounded-lg ${isDarkMode ? 'bg-blue-600/10' : 'bg-blue-50/80'}`}>
            <AlertCircle className="w-5 h-5 text-blue-500" />
            <p className={`text-xs ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
              Nächste Abbuchung: <span className="font-semibold">€249,00</span> am <span className="font-semibold">01.03.2026</span>
            </p>
          </div>
        </div>

        {/* Subscription Summary */}
        <div className={cardClass}>
          <h3 className={`text-base font-semibold mb-3 ${textPrimary}`}>Abo-Zusammenfassung</h3>
          <div className="space-y-3">
            {[
              { label: 'Plan', value: 'Professional' },
              { label: 'Fahrzeuge', value: '10 / 25 genutzt' },
              { label: 'Benutzer', value: '9 / 10 genutzt' },
              { label: 'Abrechnungszyklus', value: 'Monatlich' },
              { label: 'Nächste Verlängerung', value: '01.03.2026' },
              { label: 'Mitglied seit', value: 'September 2025' },
            ].map((item) => (
              <div key={item.label} className={`flex items-center justify-between py-1.5 ${isDarkMode ? 'border-neutral-700/20' : 'border-gray-100/50'}`}>
                <span className={`text-xs ${textSecondary}`}>{item.label}</span>
                <span className={`text-xs font-semibold ${textPrimary}`}>{item.value}</span>
              </div>
            ))}
          </div>
          <div className={`mt-4 pt-4 border-t ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-200/60'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs ${textSecondary}`}>Fahrzeug-Auslastung</span>
              <span className={`text-xs font-semibold ${textPrimary}`}>40%</span>
            </div>
            <div className={`w-full h-2 rounded-full mt-2 ${isDarkMode ? 'bg-neutral-700/50' : 'bg-gray-200/80'}`}>
              <div className="h-2 rounded-full bg-blue-500" style={{ width: '40%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Invoice History */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-base font-semibold ${textPrimary}`}>Rechnungsverlauf</h3>
          <button className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            isDarkMode ? 'text-blue-400 hover:bg-blue-600/10' : 'text-blue-600 hover:bg-blue-50'
          }`}>
            <Download className="w-3.5 h-3.5" /> Alle exportieren
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className={isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}>
                <th className={`text-left px-3 py-2 text-xs font-semibold ${textSecondary}`}>Rechnungs-Nr.</th>
                <th className={`text-left px-3 py-2 text-xs font-semibold ${textSecondary}`}>Zeitraum</th>
                <th className={`text-left px-3 py-2 text-xs font-semibold ${textSecondary}`}>Datum</th>
                <th className={`text-right px-3 py-2 text-xs font-semibold ${textSecondary}`}>Betrag</th>
                <th className={`text-center px-3 py-2 text-xs font-semibold ${textSecondary}`}>Status</th>
                <th className={`text-right px-3 py-2 text-xs font-semibold ${textSecondary}`}>Download</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className={`border-t ${isDarkMode ? 'border-neutral-700/30' : 'border-gray-100'}`}>
                  <td className={`px-3 py-2.5 text-xs font-mono font-medium ${textPrimary}`}>{inv.id}</td>
                  <td className={`px-3 py-2.5 text-xs ${textSecondary}`}>{inv.period}</td>
                  <td className={`px-3 py-2.5 text-xs ${textSecondary}`}>{inv.date}</td>
                  <td className={`px-3 py-2.5 text-xs font-semibold text-right ${textPrimary}`}>{inv.amount}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100/80 text-emerald-700'
                    }`}>
                      <Check className="w-3 h-3" /> {inv.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                      <Download className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN SETTINGS VIEW
// ============================================
export function SettingsView({ isDarkMode, activeTab: controlledTab = 'company', onTabChange }: SettingsViewProps) {
  const { orgId, hasPermission } = useRentalOrg();
  const activeTab = controlledTab;
  const setActiveTab = (tab: SettingsTab) => onTabChange?.(tab);
  const canWriteDataAuth = hasPermission('data-authorization', 'write');

  const tabs: { id: SettingsTab; label: string; icon: typeof Building2 }[] = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'company', label: 'Company Profile', icon: Building2 },
    { id: 'fleet-connection', label: 'Fleet Connection', icon: Wifi },
    { id: 'users', label: 'Users & Roles', icon: UserCog },
    { id: 'billing', label: 'Billing & Subscriptions', icon: CreditCard },
    { id: 'data-authorization', label: 'Data Authorization', icon: Database },
  ];

  return (
    <div className="space-y-5">
      {/* Settings Tab Navigation */}
      <div className={`rounded-lg p-1.5 border flex gap-1 ${
        isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-gray-100 border-gray-200'
      }`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? isDarkMode
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'bg-white text-gray-900 shadow-sm'
                : isDarkMode
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-neutral-800/50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'account' && <AccountInformationTab isDarkMode={isDarkMode} />}
      {activeTab === 'company' && <CompanyProfileTab isDarkMode={isDarkMode} orgId={orgId} />}
      {activeTab === 'fleet-connection' && <FleetConnectionTab isDarkMode={isDarkMode} />}
      {activeTab === 'users' && <UsersRolesTab isDarkMode={isDarkMode} orgId={orgId} />}
      {activeTab === 'billing' && <BillingTab isDarkMode={isDarkMode} />}
      {activeTab === 'data-authorization' && <DataAuthorizationTab isDarkMode={isDarkMode} canWrite={canWriteDataAuth} />}
    </div>
  );
}