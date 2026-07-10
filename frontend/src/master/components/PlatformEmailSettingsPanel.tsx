import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, Save } from 'lucide-react';
import { toast } from 'sonner';

import { api, type PlatformEmailSettingsAdminDto } from '../../lib/api';

interface PlatformEmailSettingsPanelProps {
  isDarkMode: boolean;
}

export function PlatformEmailSettingsPanel({ isDarkMode }: PlatformEmailSettingsPanelProps) {
  const [settings, setSettings] = useState<PlatformEmailSettingsAdminDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const cardClass = `rounded-3xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;
  const inputClass = `w-full px-4 py-3 rounded-xl border text-sm transition-colors outline-none ${isDarkMode ? 'bg-background border-neutral-700 text-gray-200 focus:border-brand/50 placeholder:text-gray-600' : 'bg-gray-50 border-gray-200 text-gray-700 focus:border-brand placeholder:text-gray-400'}`;
  const labelClass = `block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const subtle = isDarkMode ? 'text-muted-foreground' : 'text-gray-500';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.admin.email.getSettings();
      setSettings(data);
    } catch (err) {
      toast.error((err as Error).message || 'E-Mail-Einstellungen konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.admin.email.updateSettings({
        defaultFromEmail: settings.defaultFromEmail,
        defaultFromName: settings.defaultFromName,
        defaultReplyToEmail: settings.defaultReplyToEmail,
      });
      setSettings(updated);
      toast.success('Plattform-Absender gespeichert');
    } catch (err) {
      toast.error((err as Error).message || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm ${subtle}`}>
        <Loader2 className="w-4 h-4 animate-spin" /> Lädt Plattform-E-Mail…
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className={`${cardClass} p-8`}>
      <div className="flex items-start gap-4 mb-6">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDarkMode ? 'surface-premium' : 'bg-gray-100'}`}>
          <Mail className="w-7 h-7 text-brand" />
        </div>
        <div>
          <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Plattform-Absender (Standard)
          </h2>
          <p className={`text-sm mt-1 ${subtle}`}>
            Globale noreply-Absenderadresse für alle Unternehmen im Modus „SynqDrive Standard-Absender“.
            Eigene Domains konfigurieren Mandanten unter Administration → E-Mail & Versand.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <label className={labelClass}>Absender-E-Mail</label>
          <input
            type="email"
            value={settings.defaultFromEmail}
            onChange={(e) => setSettings({ ...settings, defaultFromEmail: e.target.value })}
            className={inputClass}
            placeholder="noreply@synqdrive.eu"
          />
        </div>
        <div>
          <label className={labelClass}>Absendername</label>
          <input
            type="text"
            value={settings.defaultFromName}
            onChange={(e) => setSettings({ ...settings, defaultFromName: e.target.value })}
            className={inputClass}
            placeholder="SynqDrive"
          />
        </div>
        <div className="lg:col-span-2">
          <label className={labelClass}>Standard Reply-To (optional)</label>
          <input
            type="email"
            value={settings.defaultReplyToEmail ?? ''}
            onChange={(e) =>
              setSettings({ ...settings, defaultReplyToEmail: e.target.value || null })
            }
            className={inputClass}
            placeholder="support@synqdrive.eu"
          />
        </div>
      </div>

      <div className={`mt-6 rounded-xl border px-4 py-3 text-sm ${isDarkMode ? 'border-neutral-800 bg-neutral-950/50 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
        <div className="font-medium text-foreground mb-1">Aktiv im Versand</div>
        <div>
          {settings.effectiveFromName} &lt;{settings.effectiveFromEmail}&gt;
          {settings.effectiveReplyToEmail ? ` · Reply-To: ${settings.effectiveReplyToEmail}` : ''}
        </div>
        {!settings.configuredInDatabase && (
          <div className={`mt-2 text-xs ${subtle}`}>
            Noch nicht in der Datenbank gespeichert — es gelten die Werte aus der Umgebungskonfiguration
            (`EMAIL_DEFAULT_FROM` / `EMAIL_DEFAULT_FROM_NAME`).
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl text-sm font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Speichern
        </button>
      </div>
    </div>
  );
}
