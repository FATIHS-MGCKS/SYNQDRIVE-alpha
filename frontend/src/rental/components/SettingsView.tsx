import { useState, useMemo, useEffect } from 'react';
import {
  Building2, Wifi, MapPin, UserCog, CreditCard, Upload, Trash2, Plus,
  Edit3, Save, X, Search, ChevronDown, Check, Signal, SignalZero,
  Download, ExternalLink, Shield, Crown, Eye, Mail, Phone, Globe,
  Clock, FileText, Image, AlertCircle, CheckCircle, CheckCircle2, XCircle, Users, Zap, Star,
  Database, Lock, ToggleLeft, ToggleRight, Key, ShieldCheck, FileCheck,
  User, Camera, Smartphone, MapPin as MapPinIcon, Car
} from 'lucide-react';
import { getStoredUser } from '../../lib/auth';
import { useRentalOrg } from '../RentalContext';
import { api, type FleetConnectivityResponse, type FleetConnectivityVehicle } from '../../lib/api';
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
/** Persisted client-side: no tenant org profile PATCH exists (admin API is MASTER_ADMIN only). */
const RENTAL_COMPANY_PROFILE_STORAGE_PREFIX = 'synqdrive.rental.companyProfile.';

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
    phone: '',
    timezone: '',
    language: '',
    website: '',
  };
}

function loadCompanyProfileFromStorage(orgId: string): CompanyProfileData {
  if (!orgId) return emptyCompanyProfileData();
  try {
    const raw = localStorage.getItem(RENTAL_COMPANY_PROFILE_STORAGE_PREFIX + orgId);
    if (!raw) return emptyCompanyProfileData();
    const parsed = JSON.parse(raw) as Partial<CompanyProfileData>;
    return { ...emptyCompanyProfileData(), ...parsed };
  } catch {
    return emptyCompanyProfileData();
  }
}

function CompanyProfileTab({ isDarkMode, orgId }: { isDarkMode: boolean; orgId?: string }) {
  const [companyData, setCompanyData] = useState<CompanyProfileData>(() =>
    loadCompanyProfileFromStorage(orgId ?? ''),
  );
  const [isEditing, setIsEditing] = useState(false);
  const [saveMessage, setSaveMessage] = useState<'ok' | 'err' | null>(null);

  useEffect(() => {
    setCompanyData(loadCompanyProfileFromStorage(orgId ?? ''));
  }, [orgId]);

  const persistCompanyProfile = () => {
    if (!orgId?.trim()) {
      setSaveMessage('err');
      return false;
    }
    try {
      localStorage.setItem(
        RENTAL_COMPANY_PROFILE_STORAGE_PREFIX + orgId,
        JSON.stringify(companyData),
      );
      setSaveMessage('ok');
      return true;
    } catch {
      setSaveMessage('err');
      return false;
    }
  };

  const handlePrimaryAction = () => {
    setSaveMessage(null);
    if (isEditing) {
      if (persistCompanyProfile()) setIsEditing(false);
    } else {
      setIsEditing(true);
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={`text-lg font-bold tracking-tight ${textPrimary}`}>Company Profile</h2>
          <p className={`text-xs mt-1 ${textSecondary}`}>Verwalten Sie Ihre Unternehmensdaten und Dokumente</p>
          {saveMessage === 'ok' && (
            <p className="text-xs mt-1 text-emerald-500">Gespeichert.</p>
          )}
          {saveMessage === 'err' && (
            <p className="text-xs mt-1 text-red-500">
              {!orgId?.trim()
                ? 'Keine Organisation geladen — Profil kann nicht gespeichert werden.'
                : 'Speichern fehlgeschlagen.'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handlePrimaryAction}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
            isEditing
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25'
              : isDarkMode
                ? 'bg-neutral-800/60 border border-neutral-700/50 text-gray-300 hover:bg-neutral-700/60'
                : 'bg-white/80 border border-gray-200 text-gray-700 hover:bg-white hover:shadow-md'
          }`}
        >
          {isEditing ? <><Save className="w-5 h-5" /> Save Changes</> : <><Edit3 className="w-5 h-5" /> Edit Profile</>}
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
          {/* Company Logo */}
          <div className={cardClass}>
            <h3 className={`text-base font-semibold mb-3 ${textPrimary}`}>Firmenlogo</h3>
            <div className={`border-2 border-dashed rounded-lg p-8 text-center ${
              isDarkMode ? 'border-neutral-700/50 bg-neutral-800/30' : 'border-gray-200 bg-gray-50/50'
            }`}>
              <div className={`w-20 h-20 mx-auto mb-3 rounded-lg flex items-center justify-center ${
                isDarkMode ? 'bg-neutral-700/50' : 'bg-gray-100'
              }`}>
                <Image className={`w-5 h-5 ${textSecondary}`} />
              </div>
              <p className={`text-xs font-medium mb-1 ${textPrimary}`}>Logo hochladen</p>
              <p className={`text-xs ${textSecondary}`}>PNG, JPG bis 2MB</p>
              <button className="mt-3 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
                Datei auswählen
              </button>
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
// STATIONS & BRANCHES TAB
// ============================================
export function StationsTab({ isDarkMode }: { isDarkMode: boolean }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStation, setNewStation] = useState({ name: '', address: '', manager: '', city: '', phone: '' });

  const cardClass = `rounded-lg p-4 shadow-sm border ${
    isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
  }`;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-3 py-2.5 rounded-lg border text-xs transition-all duration-200 ${
    isDarkMode
      ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20'
      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20'
  } outline-none`;
  const labelClass = `block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;

  const stations: Array<{
    id: string;
    name: string;
    address: string;
    city: string;
    manager: string;
    phone: string;
    vehicles: number;
    status: string;
  }> = [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-bold tracking-tight ${textPrimary}`}>Stations & Branches</h2>
          <p className={`text-xs mt-1 ${textSecondary}`}>{stations.length} Standorte · {stations.reduce((sum, s) => sum + s.vehicles, 0)} Fahrzeuge zugewiesen</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-3 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25"
        >
          <Plus className="w-5 h-5" /> Standort hinzufügen
        </button>
      </div>

      {showAddForm && (
        <div className={`${cardClass} border-l-4 !border-l-blue-500`}>
          <h3 className={`text-base font-semibold mb-3 ${textPrimary}`}>Neuen Standort anlegen</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Stationsname</label>
              <input type="text" placeholder="z.B. Berlin Mitte" value={newStation.name} onChange={(e) => setNewStation({...newStation, name: e.target.value})} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Stadt</label>
              <input type="text" placeholder="z.B. Berlin" value={newStation.city} onChange={(e) => setNewStation({...newStation, city: e.target.value})} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Adresse</label>
              <input type="text" placeholder="Straße, PLZ, Ort" value={newStation.address} onChange={(e) => setNewStation({...newStation, address: e.target.value})} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Stationsleiter</label>
              <input type="text" placeholder="Name" value={newStation.manager} onChange={(e) => setNewStation({...newStation, manager: e.target.value})} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Telefon</label>
              <input type="text" placeholder="+49..." value={newStation.phone} onChange={(e) => setNewStation({...newStation, phone: e.target.value})} className={inputClass} />
            </div>
            <div className="flex items-end">
              <button className="w-full px-3 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors">
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {stations.length === 0 ? (
        <div
          className={`${cardClass} flex flex-col items-center justify-center py-16 px-6 text-center border-dashed ${
            isDarkMode ? 'border-neutral-600/60' : 'border-gray-300/80'
          }`}
        >
          <div className={`p-4 rounded-full mb-3 ${isDarkMode ? 'bg-neutral-800/80' : 'bg-gray-100'}`}>
            <MapPin className={`w-10 h-10 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
          </div>
          <p className={`text-sm font-semibold ${textPrimary}`}>No stations</p>
          <p className={`text-xs mt-1 max-w-sm ${textSecondary}`}>
            No stations have been created yet. Use &quot;Standort hinzufügen&quot; to add your first location.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {stations.map((station) => (
            <div key={station.id} className={`${cardClass} hover:shadow-[0_20px_60px_rgb(0,0,0,0.1)] transition-all duration-300`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-lg ${isDarkMode ? 'bg-blue-600/15' : 'bg-blue-50'}`}>
                    <MapPin className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  </div>
                  <div>
                    <h3 className={`text-base font-semibold ${textPrimary}`}>{station.name}</h3>
                    <p className={`text-xs ${textSecondary}`}>{station.address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className={`text-xs font-bold ${textPrimary}`}>{station.vehicles}</p>
                    <p className={`text-xs ${textSecondary}`}>Fahrzeuge</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-medium ${textPrimary}`}>{station.manager}</p>
                    <p className={`text-xs ${textSecondary}`}>{station.phone}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100/80 text-emerald-700'
                  }`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Aktiv
                  </div>
                  <div className="flex gap-1">
                    <button className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-gray-100'}`}>
                      <Edit3 className={`w-5 h-5 ${textSecondary}`} />
                    </button>
                    <button className="p-2 rounded-lg hover:bg-red-100 hover:text-red-500 transition-colors">
                      <Trash2 className={`w-5 h-5 ${textSecondary}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
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