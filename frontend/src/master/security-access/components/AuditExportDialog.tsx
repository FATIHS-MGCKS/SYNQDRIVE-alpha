import { useState } from 'react';
import { Download } from 'lucide-react';
import { FormDialog } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { getToken } from '../../../lib/auth';

export interface AuditExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultOrganizationId?: string | null;
}

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AuditExportDialog({ open, onOpenChange, defaultOrganizationId }: AuditExportDialogProps) {
  const [from, setFrom] = useState(defaultFromDate());
  const [to, setTo] = useState(todayDate());
  const [format, setFormat] = useState<'json' | 'csv'>('csv');
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    if (!from || !to) {
      setError('Zeitraum ist Pflicht.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        format,
        from: new Date(from).toISOString(),
        to: new Date(`${to}T23:59:59.999Z`).toISOString(),
      });
      if (organizationId.trim()) params.set('organizationId', organizationId.trim());

      const token = getToken();
      const res = await fetch(`/api/v1/admin/activity-log/export?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.status === 403) {
        window.dispatchEvent(new CustomEvent('synqdrive:step-up-required', { detail: { action: 'MASTER_AUDIT_EXPORT' } }));
        throw new Error('Schritt-für-Schritt-Bestätigung erforderlich.');
      }

      if (!res.ok) {
        let message = `Export fehlgeschlagen (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `audit-export.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Export fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Audit exportieren"
      description="Export enthält personenbezogene Daten (E-Mail, IP). Nur für autorisierte Compliance-Zwecke."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="button" onClick={() => void handleExport()} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            {loading ? 'Export…' : 'Export starten'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">Von</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Bis</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Organisation (optional)</label>
          <input
            type="text"
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            placeholder="Organisations-ID oder leer = Plattform"
            className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Format</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as 'json' | 'csv')}
            className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </FormDialog>
  );
}
