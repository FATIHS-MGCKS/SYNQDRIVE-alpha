import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../ui/Icon';
import { api } from '../../../lib/api';
import type { Invoice } from './invoiceTypes';
import { INVOICE_EXTRACTION_FIELDS } from './invoiceUtils';

interface InvoiceExtractionUploadProps {
  isDarkMode: boolean;
  orgId: string;
  vehicles: Array<{ id: string; make?: string; model?: string; licensePlate?: string; license?: string }>;
  onClose: () => void;
  onCreated: (inv: Invoice) => void;
  card: string;
  tp: string;
  ts: string;
}

type Step = 'select' | 'uploading' | 'processing' | 'review';

export function InvoiceExtractionUpload({
  isDarkMode,
  orgId,
  vehicles,
  onClose,
  onCreated,
  card,
  tp,
  ts,
}: InvoiceExtractionUploadProps) {
  const [step, setStep] = useState<Step>('select');
  const [vehicleId, setVehicleId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const vehicleLabel = (v: (typeof vehicles)[0]) =>
    [v.make, v.model, v.licensePlate || v.license].filter(Boolean).join(' · ') || v.id.slice(0, 8);

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => stopPoll(), []);

  const startUpload = async () => {
    if (!file || !vehicleId) return;
    setError(null);
    setStep('uploading');
    try {
      const res = await api.vehicleIntelligence.uploadDocumentExtraction(vehicleId, file, 'INVOICE', 'invoices_page');
      setExtractionId(res.id);
      setStep('processing');
      pollRef.current = setInterval(async () => {
        try {
          const ext = await api.vehicleIntelligence.getDocumentExtraction(vehicleId, res.id);
          if (ext.status === 'COMPLETED' || ext.status === 'NEEDS_REVIEW') {
            stopPoll();
            const data = (ext.extractedData ?? {}) as Record<string, unknown>;
            const mapped: Record<string, string> = {};
            for (const f of INVOICE_EXTRACTION_FIELDS) {
              const v = data[f.key];
              mapped[f.key] = v != null ? String(v) : '';
            }
            setConfirmed(mapped);
            setStep('review');
          } else if (ext.status === 'FAILED') {
            stopPoll();
            setError(ext.errorMessage || 'Extraktion fehlgeschlagen');
            setStep('select');
          }
        } catch {
          stopPoll();
          setError('Extraktionsstatus konnte nicht geladen werden');
          setStep('select');
        }
      }, 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload fehlgeschlagen');
      setStep('select');
    }
  };

  const handleConfirm = async () => {
    if (!vehicleId || !extractionId) return;
    setSaving(true);
    setError(null);
    try {
      const confirmedData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(confirmed)) {
        if (v.trim()) confirmedData[k] = k === 'totalCents' ? Number(v) : v;
      }
      await api.vehicleIntelligence.confirmDocumentExtraction(vehicleId, extractionId, {
        confirmedData,
      });
      toast.success('Rechnung erfasst', {
        description: 'Eingangsrechnung wurde über den Document-Extraction-Flow angelegt.',
      });
      const list = await api.invoices.list(orgId, { status: 'NEEDS_REVIEW' });
      const created = Array.isArray(list) ? list[0] : null;
      if (created) onCreated(created as Invoice);
      else onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bestätigung fehlgeschlagen');
      toast.error('Rechnung konnte nicht erfasst werden');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = `w-full px-4 py-3 rounded-xl border text-xs ${
    isDarkMode
      ? 'surface-premium border-neutral-700 text-white'
      : 'bg-white border-gray-200 text-gray-900'
  } outline-none`;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button type="button" onClick={onClose} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
        <Icon name="chevron-left" className="w-4 h-4" /> Zurück
      </button>

      <div className={`${card} p-6`}>
        <div className="flex items-center gap-3 mb-4">
          <Icon name="sparkles" className="w-5 h-5 text-purple-500" />
          <div>
            <h2 className={`text-base font-bold ${tp}`}>Eingangsrechnung per KI-Upload</h2>
            <p className={`text-xs ${ts}`}>
              Nutzt den zentralen Document-Extraction-Flow — kein separater Invoice-OCR-Pfad.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
            {error}
          </div>
        )}

        {step === 'select' && (
          <div className="space-y-4">
            <label className="block text-xs font-semibold">
              Fahrzeug (Zuordnung für Extraction)
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className={`${inputCls} mt-1`}
              >
                <option value="">Fahrzeug wählen…</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                  </option>
                ))}
              </select>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`w-full rounded-xl border border-dashed px-4 py-8 text-center text-xs ${ts}`}
            >
              {file ? file.name : 'PDF oder Bild auswählen'}
            </button>
            <button
              type="button"
              disabled={!file || !vehicleId}
              onClick={startUpload}
              className="w-full rounded-xl bg-purple-600 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Upload & Extraktion starten
            </button>
          </div>
        )}

        {(step === 'uploading' || step === 'processing') && (
          <div className="py-10 text-center">
            <Icon name="loader-2" className={`w-8 h-8 mx-auto animate-spin text-purple-500`} />
            <p className={`mt-3 text-sm font-semibold ${tp}`}>
              {step === 'uploading' ? 'Datei wird hochgeladen…' : 'KI extrahiert Rechnungsdaten…'}
            </p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3">
            <p className={`text-xs ${ts}`}>Bitte extrahierte Werte prüfen und bestätigen.</p>
            {INVOICE_EXTRACTION_FIELDS.map((f) => (
              <label key={f.key} className="block text-xs">
                <span className="font-semibold">{f.label}</span>
                <input
                  value={confirmed[f.key] ?? ''}
                  onChange={(e) => setConfirmed((p) => ({ ...p, [f.key]: e.target.value }))}
                  className={`${inputCls} mt-1`}
                />
              </label>
            ))}
            <button
              type="button"
              disabled={saving}
              onClick={handleConfirm}
              className="mt-2 w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Wird erfasst…' : 'Bestätigen & Rechnung anlegen'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
