import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { api, type PlatformEmailSettingsAdminDto } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { ChangePreviewDialog } from './ChangePreviewDialog';
import { TestEmailDialog } from './TestEmailDialog';

interface PlatformEmailSettingsSectionProps {
  onSaved?: () => void;
}

export function PlatformEmailSettingsSection({ onSaved }: PlatformEmailSettingsSectionProps) {
  const [baseline, setBaseline] = useState<PlatformEmailSettingsAdminDto | null>(null);
  const [draft, setDraft] = useState<PlatformEmailSettingsAdminDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [reason, setReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.admin.email.getSettings();
      setBaseline(data);
      setDraft(data);
    } catch (err) {
      toast.error((err as Error).message || 'E-Mail-Einstellungen konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const dirty = useMemo(() => {
    if (!baseline || !draft) return false;
    return (
      baseline.defaultFromEmail !== draft.defaultFromEmail ||
      baseline.defaultFromName !== draft.defaultFromName ||
      (baseline.defaultReplyToEmail ?? '') !== (draft.defaultReplyToEmail ?? '')
    );
  }, [baseline, draft]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await api.admin.email.updateSettings({
        defaultFromEmail: draft.defaultFromEmail,
        defaultFromName: draft.defaultFromName,
        defaultReplyToEmail: draft.defaultReplyToEmail,
        reason: reason.trim() || undefined,
      });
      setBaseline(updated);
      setDraft(updated);
      setPreviewOpen(false);
      setReason('');
      toast.success('Plattform-Absender gespeichert');
      onSaved?.();
    } catch (err) {
      toast.error((err as Error).message || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Lädt Plattform-E-Mail…
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="surface-premium rounded-2xl p-6 shadow-[var(--shadow-1)] space-y-5" data-testid="platform-email-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-brand" />
            <h3 className="text-lg font-semibold">Plattform-Absender</h3>
            <span className="rounded-lg bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Plattform
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Globaler Standard-Absender für Mandanten im Modus „SynqDrive Standard-Absender“. Eigene Domains
            konfigurieren Mandanten unter Administration → E-Mail & Versand.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setTestOpen(true)}>
          Test-E-Mail
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-2">Absender-E-Mail</label>
          <input
            type="email"
            value={draft.defaultFromEmail}
            onChange={(e) => setDraft({ ...draft, defaultFromEmail: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border text-sm bg-background"
            placeholder="noreply@synqdrive.eu"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-2">Absendername</label>
          <input
            type="text"
            value={draft.defaultFromName}
            onChange={(e) => setDraft({ ...draft, defaultFromName: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border text-sm bg-background"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="block text-sm font-semibold mb-2">Standard Reply-To (optional)</label>
          <input
            type="email"
            value={draft.defaultReplyToEmail ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, defaultReplyToEmail: e.target.value || null })
            }
            className="w-full px-4 py-3 rounded-xl border text-sm bg-background"
          />
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
        <div className="font-medium">Aktiv im Versand</div>
        <div className="text-muted-foreground mt-1">
          {draft.effectiveFromName} &lt;{draft.effectiveFromEmail}&gt;
        </div>
      </div>

      {dirty && (
        <p className="text-xs text-amber-600 dark:text-amber-300">Ungespeicherte Änderungen</p>
      )}

      <div className="flex flex-wrap gap-2 justify-end">
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => baseline && setDraft(baseline)}
            disabled={saving}
          >
            Verwerfen
          </Button>
        )}
        <Button
          type="button"
          onClick={() => setPreviewOpen(true)}
          disabled={!dirty || saving}
          className="gap-2"
        >
          <Save className="w-4 h-4" />
          Speichern
        </Button>
      </div>

      <ChangePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Plattform-Absender ändern"
        current={`${baseline?.effectiveFromName} <${baseline?.effectiveFromEmail}>`}
        proposed={`${draft.defaultFromName} <${draft.defaultFromEmail}>`}
        scope="Plattform — betrifft Mandanten im Standard-Absender-Modus"
        impact="Transaktions-E-Mails verwenden ab Speichern den neuen Absender."
        effectiveTime="Sofort"
        reason={reason}
        onReasonChange={setReason}
        onConfirm={() => void save()}
        confirming={saving}
        requireReason
      />

      <TestEmailDialog open={testOpen} onOpenChange={setTestOpen} />
    </div>
  );
}
