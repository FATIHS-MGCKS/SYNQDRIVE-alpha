import {
  ExternalLink,
  ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  DataCard,
  EmptyState,
  SkeletonCard,
  StatusChip,
  Timeline,
} from '../../../../components/patterns';
import { Button } from '../../../../components/ui/button';
import type { LegalDocumentDto, TenantOrganizationProfileDto } from '../../../../lib/api';
import type { ActivityLogRow } from './useCompanyCenter';
import {
  CompanyCriticalNotice,
  CompanyField,
  CompanyFieldGrid,
} from './CompanyField';
import {
  buildDocumentStatusRows,
  LANGUAGE_OPTIONS,
  LEGAL_FORM_OPTIONS,
  TIMEZONE_OPTIONS,
  type CompanyDraft,
  type DocumentStatusRow,
} from './company-utils';

const ALLOWED_LOGO = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

interface SectionProps {
  editing: boolean;
  draft: CompanyDraft;
  onChange: (patch: Partial<CompanyDraft>) => void;
}

export function CompanyBasisSection({ editing, draft, onChange }: SectionProps) {
  return (
    <DataCard title="Basisdaten" description="Identität und Lokalisierung im Mandanten.">
      <CompanyFieldGrid>
        <div className="md:col-span-2">
          <CompanyField
            label="Anzeigename"
            value={draft.companyName}
            editing={editing}
            required
            onChange={(v) => onChange({ companyName: v })}
          />
        </div>
        <CompanyField
          label="Rechtlicher Firmenname"
          value={draft.legalCompanyName}
          editing={editing}
          onChange={(v) => onChange({ legalCompanyName: v })}
        />
        <CompanyField
          label="Rechtsform"
          value={draft.legalForm}
          editing={editing}
          type="select"
          options={LEGAL_FORM_OPTIONS}
          onChange={(v) => onChange({ legalForm: v })}
        />
        <CompanyField
          label="Geschäftsführer / Inhaber"
          value={draft.managerName}
          editing={editing}
          onChange={(v) => onChange({ managerName: v })}
        />
        <CompanyField
          label="E-Mail Geschäftsführung"
          value={draft.managerEmail}
          editing={editing}
          type="email"
          onChange={(v) => onChange({ managerEmail: v })}
        />
        <CompanyField
          label="Hauptsprache"
          value={draft.language}
          editing={editing}
          type="select"
          options={LANGUAGE_OPTIONS}
          onChange={(v) => onChange({ language: v })}
        />
        <CompanyField
          label="Zeitzone"
          value={draft.timezone}
          editing={editing}
          type="select"
          options={TIMEZONE_OPTIONS.map((tz) => ({ value: tz, label: tz }))}
          onChange={(v) => onChange({ timezone: v })}
        />
      </CompanyFieldGrid>
    </DataCard>
  );
}

export function CompanyContactSection({ editing, draft, onChange }: SectionProps) {
  return (
    <DataCard title="Adresse & Kontakt" description="Erreichbarkeit und Standort.">
      <CompanyFieldGrid>
        <div className="md:col-span-2">
          <CompanyField
            label="Straße / Adresse"
            value={draft.address}
            editing={editing}
            required
            onChange={(v) => onChange({ address: v })}
          />
        </div>
        <CompanyField
          label="PLZ"
          value={draft.zip}
          editing={editing}
          onChange={(v) => onChange({ zip: v })}
        />
        <CompanyField
          label="Stadt"
          value={draft.city}
          editing={editing}
          required
          onChange={(v) => onChange({ city: v })}
        />
        <CompanyField
          label="Bundesland"
          value={draft.state}
          editing={editing}
          onChange={(v) => onChange({ state: v })}
        />
        <CompanyField
          label="Land"
          value={draft.country}
          editing={editing}
          required
          onChange={(v) => onChange({ country: v })}
        />
        <CompanyField
          label="Telefon"
          value={draft.phone}
          editing={editing}
          onChange={(v) => onChange({ phone: v })}
        />
        <CompanyField
          label="E-Mail"
          value={draft.email}
          editing={editing}
          type="email"
          required
          onChange={(v) => onChange({ email: v })}
        />
        <CompanyField
          label="Website"
          value={draft.website}
          editing={editing}
          hint={editing ? 'Ohne https:// wird automatisch ergänzt.' : undefined}
          onChange={(v) => onChange({ website: v })}
        />
        <CompanyField
          label="Rechnungs-E-Mail"
          value={draft.invoiceEmail}
          editing={editing}
          type="email"
          hint="Optional — separate Adresse für Rechnungsversand."
          onChange={(v) => onChange({ invoiceEmail: v })}
        />
      </CompanyFieldGrid>
    </DataCard>
  );
}

export function CompanyTaxSection({ editing, draft, onChange }: SectionProps) {
  return (
    <DataCard title="Steuer & Rechnung" description="Steuerliche Angaben für Ausgangsrechnungen.">
      <CompanyCriticalNotice>
        Änderungen an Rechnungspräfix und nächster Rechnungsnummer wirken sich auf{' '}
        <strong className="font-semibold text-foreground">künftige</strong> Rechnungen aus.
        Bereits erstellte Belege bleiben unverändert.
      </CompanyCriticalNotice>
      <CompanyFieldGrid>
        <CompanyField
          label="Steuernummer"
          value={draft.taxNumber}
          editing={editing}
          onChange={(v) => onChange({ taxNumber: v })}
        />
        <CompanyField
          label="USt-ID"
          value={draft.vatId}
          editing={editing}
          onChange={(v) => onChange({ vatId: v })}
        />
        <div className="md:col-span-2">
          <CompanyField
            label="Kleinunternehmerregelung"
            value=""
            editing={editing}
            type="checkbox"
            checked={draft.isSmallBusiness}
            onCheckedChange={(c) => onChange({ isSmallBusiness: c })}
          />
        </div>
        <CompanyField
          label="Standard-MwSt. (%)"
          value={draft.defaultVatRate}
          editing={editing}
          type="number"
          onChange={(v) => onChange({ defaultVatRate: v })}
        />
        <CompanyField
          label="Zahlungsziel (Tage)"
          value={draft.paymentTermsDays}
          editing={editing}
          type="number"
          onChange={(v) => onChange({ paymentTermsDays: v })}
        />
        <CompanyField
          label="Rechnungspräfix"
          value={draft.invoicePrefix}
          editing={editing}
          warning
          hint="Präfix für neue Rechnungsnummern, z. B. RE-"
          onChange={(v) => onChange({ invoicePrefix: v })}
        />
        <CompanyField
          label="Nächste Rechnungsnummer"
          value={draft.nextInvoiceNumber}
          editing={editing}
          type="number"
          warning
          hint="Startwert für die nächste ausgestellte Rechnung (mindestens 1)."
          onChange={(v) => onChange({ nextInvoiceNumber: v })}
        />
        <CompanyField
          label="Bankname"
          value={draft.bankName}
          editing={editing}
          onChange={(v) => onChange({ bankName: v })}
        />
        <CompanyField
          label="IBAN"
          value={draft.iban}
          editing={editing}
          warning
          onChange={(v) => onChange({ iban: v })}
        />
        <CompanyField
          label="BIC"
          value={draft.bic}
          editing={editing}
          onChange={(v) => onChange({ bic: v })}
        />
      </CompanyFieldGrid>
    </DataCard>
  );
}

interface BrandingProps extends SectionProps {
  profile: TenantOrganizationProfileDto;
  logoUploading: boolean;
  canEdit: boolean;
  onUpload: (file: File) => Promise<void>;
  onRemoveLogo: () => Promise<void>;
}

export function CompanyBrandingSection({
  editing,
  draft,
  profile,
  logoUploading,
  canEdit,
  onChange,
  onUpload,
  onRemoveLogo,
}: BrandingProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const logoUrl = profile.logoUrl;

  const handleFile = async (file: File) => {
    const mime = file.type.toLowerCase();
    if (!ALLOWED_LOGO.includes(mime)) {
      toast.error('Nur PNG, JPG/JPEG und WebP sind erlaubt (kein SVG oder GIF).');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Die Datei ist zu groß. Maximal 2 MB erlaubt.');
      return;
    }
    await onUpload(file);
    setLogoBroken(false);
  };

  return (
    <div className="space-y-3">
      <DataCard title="Branding" description="Logo und Erscheinungsbild.">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
        <div
          className={`rounded-xl border border-dashed p-4 text-center transition-colors ${
            dragOver ? 'border-[var(--brand)] bg-[var(--brand-soft)]/30' : 'border-border/70 bg-muted/20'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            if (canEdit) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!canEdit) return;
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
        >
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-muted">
            {logoUrl && !logoBroken ? (
              <img
                src={logoUrl}
                alt="Firmenlogo"
                className="w-full h-full object-contain"
                onError={() => setLogoBroken(true)}
              />
            ) : (
              <ImageIcon className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <p className="text-xs font-medium text-foreground">
            {logoUrl ? 'Logo ersetzen' : 'Logo hochladen'}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            PNG, JPG oder WebP · max. 2 MB
          </p>
          {canEdit && (
            <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={logoUploading}
                onClick={() => fileRef.current?.click()}
              >
                {logoUploading ? <Loader2 className="animate-spin" /> : <Upload />}
                Datei wählen
              </Button>
              {logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={logoUploading}
                  onClick={() => void onRemoveLogo()}
                >
                  <Trash2 />
                  Entfernen
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 space-y-3">
          <CompanyField
            label="Akzentfarbe"
            value={draft.accentColor}
            editing={editing}
            hint="Optional — Hex-Farbwert, z. B. #0F766E"
            onChange={(v) => onChange({ accentColor: v })}
          />
          <CompanyField
            label="PDF-Fußzeile"
            value={draft.pdfFooterText}
            editing={editing}
            type="textarea"
            rows={3}
            onChange={(v) => onChange({ pdfFooterText: v })}
          />
          <CompanyField
            label="E-Mail-Signatur"
            value={draft.emailSignature}
            editing={editing}
            type="textarea"
            rows={4}
            onChange={(v) => onChange({ emailSignature: v })}
          />
        </div>
      </DataCard>

      <div className="sq-card border border-border/60 p-3.5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Vorschau auf Dokumenten
        </p>
        <div className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
          <div className="flex items-center gap-3">
            {logoUrl && !logoBroken ? (
              <img src={logoUrl} alt="" className="h-8 max-w-[120px] object-contain" />
            ) : (
              <div className="h-8 px-3 rounded-lg bg-muted text-xs font-semibold flex items-center">
                {profile.companyName || 'Unternehmen'}
              </div>
            )}
          </div>
          <p className="text-xs font-semibold text-foreground">
            {draft.legalCompanyName.trim() || draft.companyName || 'Firmenname'}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {[draft.address, draft.zip, draft.city].filter(Boolean).join(', ') || 'Adresse'}
          </p>
          {draft.pdfFooterText.trim() && (
            <p className="text-[10px] text-muted-foreground border-t border-border/40 pt-2 mt-2">
              {draft.pdfFooterText.trim()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const DOC_STATUS_LABEL: Record<DocumentStatusRow['status'], string> = {
  active: 'Hinterlegt',
  missing: 'Fehlt',
  generated: 'Systemvorlage',
  unconnected: 'Nicht angebunden',
  review: 'Prüfung nötig',
};

const DOC_TONE: Record<
  DocumentStatusRow['status'],
  'success' | 'warning' | 'neutral' | 'info'
> = {
  active: 'success',
  missing: 'warning',
  generated: 'info',
  unconnected: 'neutral',
  review: 'warning',
};

interface DocumentsSectionProps {
  legalDocs: LegalDocumentDto[];
  loading: boolean;
  onManageDocuments: () => void;
}

export function CompanyDocumentsSection({
  legalDocs,
  loading,
  onManageDocuments,
}: DocumentsSectionProps) {
  const rows = buildDocumentStatusRows(legalDocs);

  return (
    <DataCard
      title="Dokumentenstatus"
      description="Übersicht — Verwaltung unter Rechtliche Dokumente."
      actions={
        <Button type="button" variant="outline" size="sm" onClick={onManageDocuments}>
          Dokumente verwalten
          <ExternalLink />
        </Button>
      }
    >
      {loading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Dokumente werden geladen…</p>
      ) : (
        <div className="divide-y divide-border/60 rounded-lg border border-border/60">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-col justify-between gap-2 px-3 py-2.5 sm:flex-row sm:items-center"
            >
              <div>
                <p className="text-xs font-medium text-foreground">{row.label}</p>
                <p className="text-[10px] text-muted-foreground">{row.detail}</p>
              </div>
              <StatusChip tone={DOC_TONE[row.status]}>{DOC_STATUS_LABEL[row.status]}</StatusChip>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2.5 text-[11px] text-muted-foreground">
        Datenschutz und Telematik-Einwilligung erscheinen nach Anbindung im Dokumentenmodul.
      </p>
    </DataCard>
  );
}

interface HistoryProps {
  activity: ActivityLogRow[];
  loading: boolean;
}

export function CompanyHistorySection({ activity, loading }: HistoryProps) {
  if (loading) {
    return <SkeletonCard />;
  }

  if (activity.length === 0) {
    return (
      <EmptyState
        title="Änderungsverlauf wird vorbereitet"
        description="Sobald Unternehmensdaten geändert werden, erscheinen hier die letzten Einträge aus dem Aktivitätsprotokoll."
      />
    );
  }

  return (
    <DataCard title="Änderungsverlauf" description="Letzte Änderungen an Unternehmensdaten.">
      <Timeline
        items={activity.map((a) => ({
          id: a.id,
          title: a.description || a.action,
          description: a.userName ? `${a.userName} · ${a.entity}` : a.entity,
          time: new Date(a.createdAt).toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        }))}
      />
    </DataCard>
  );
}
