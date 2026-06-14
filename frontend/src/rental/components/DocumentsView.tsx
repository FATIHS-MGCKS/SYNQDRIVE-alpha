import { Icon } from './ui/Icon';
import { VehicleData } from '../data/vehicles';
import type { ReactNode } from 'react';
import { PageHeader } from '../../components/patterns/page-header';

interface DocumentsViewProps {
  isDarkMode: boolean;
  vehicle?: VehicleData | null;
}

type TuvRow = { date: string; org: string; km: string; result: string; next: string };
type ServiceRow = { date: string; art: string; workshop: string; km: string; cost: string };
type RepairRow = { date: string; repair: string; workshop: string; km: string; cost: string };

const tuvHistory: TuvRow[] = [];
const serviceHistory: ServiceRow[] = [];
const repairHistory: RepairRow[] = [];

export function DocumentsView({ isDarkMode, vehicle }: DocumentsViewProps) {
  const cardClass = `rounded-lg border shadow-sm ${
    isDarkMode
      ? 'bg-neutral-900 border-neutral-700'
      : 'bg-white border-gray-200'
  }`;

  const dash = '—';
  const vehicleName = vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(' ') : 'Kein Fahrzeug ausgewählt';
  const vehicleSubtitle = vehicle ? [vehicle.license, vehicle.station].filter(Boolean).join(' · ') : 'Wähle ein Fahrzeug aus, um Dokumente und Fixkosten zu prüfen.';
  const monthlyLines = [
    { label: 'Leasing/Finanzierung', value: vehicle?.leasingRate ?? dash, tone: 'info' as const },
    { label: 'Versicherung', value: vehicle?.insuranceCost ?? dash, tone: 'success' as const },
    { label: 'Kfz-Steuer', value: vehicle?.taxCost ?? dash, tone: 'warning' as const },
    { label: 'Wartung & Service (Ø)', value: dash, tone: 'neutral' as const },
    { label: 'Reparaturen (Ø)', value: dash, tone: 'neutral' as const },
  ];
  const configuredCostLines = monthlyLines.filter((line) => line.value !== dash && line.value !== '').length;

  const documentCards = [
    {
      title: 'Leasing/Finanzierung',
      description: 'Vertrag, Laufzeit, Rate und Restwert',
      icon: 'receipt',
      tone: 'info' as const,
      action: 'Vertrag hinzufügen',
    },
    {
      title: 'Versicherung',
      description: 'Police, Deckung und Selbstbeteiligung',
      icon: 'shield',
      tone: 'success' as const,
      action: 'Police hinzufügen',
    },
    {
      title: 'Kfz-Steuer',
      description: 'Bescheid und jährliche Steuerlast',
      icon: 'dollar-sign',
      tone: 'warning' as const,
      action: 'Bescheid hinzufügen',
    },
    {
      title: 'Zulassung',
      description: 'Fahrzeugschein und Halterdaten',
      icon: 'car',
      tone: 'brand' as const,
      action: 'Dokument hinzufügen',
    },
  ];

  const evidenceSections = [
    { title: 'TÜV / HU', subtitle: 'Prüftermine und Ergebnisnachweise', icon: 'clipboard-check', tone: 'success' as const, rows: tuvHistory.length },
    { title: 'Service', subtitle: 'Inspektionen, Ölwechsel und Wartung', icon: 'wrench', tone: 'info' as const, rows: serviceHistory.length },
    { title: 'Reparaturen', subtitle: 'Werkstattrechnungen und Schadenbelege', icon: 'file-signature', tone: 'critical' as const, rows: repairHistory.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Fahrzeug"
        title="Fahrzeugakte"
        description={vehicleSubtitle}
        icon={<Icon name="file-text" className="w-4 h-4" />}
        meta={<span className="text-[11px] text-muted-foreground truncate">{vehicleName}</span>}
      />
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-end gap-4 flex-wrap">
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:min-w-[330px]">
            <SummaryMetric label="Dokumente" value="0/4" tone="warning" />
            <SummaryMetric label="Kosten" value={`${configuredCostLines}/5`} tone={configuredCostLines >= 3 ? 'success' : 'neutral'} />
            <SummaryMetric label="Nachweise" value={`${tuvHistory.length + serviceHistory.length + repairHistory.length}`} tone="neutral" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] gap-3 items-start">
        <div className={`${cardClass} p-4 rounded-2xl`}>
          <DocumentsSectionHeader
            icon="file-text"
            title="Dokumentenstatus"
            subtitle="Pflichtunterlagen pro Fahrzeug, priorisiert nach operativer Relevanz."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
            {documentCards.map((doc) => (
              <DocumentTile
                key={doc.title}
                icon={doc.icon}
                title={doc.title}
                description={doc.description}
                action={doc.action}
                tone={doc.tone}
              />
            ))}
          </div>
        </div>

        <div className={`${cardClass} p-4 rounded-2xl`}>
          <DocumentsSectionHeader
            icon="wallet"
            title="Monatliche Fixkosten"
            subtitle="Finanzielle Grundlast des Fahrzeugs auf einen Blick."
          />
          <div className="mt-4 space-y-2.5">
            {monthlyLines.map((item) => (
              <CostRow key={item.label} label={item.label} value={item.value} tone={item.tone} />
            ))}
            <div className={`pt-3 mt-3 border-t flex items-center justify-between ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
              <span className="text-[11px] font-semibold text-foreground">Gesamt pro Monat</span>
              <span className="text-[13px] font-bold tabular-nums text-foreground">
                {vehicle?.totalMonthlyCost ?? dash}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={`${cardClass} p-4 rounded-2xl`}>
        <DocumentsSectionHeader
          icon="clipboard-list"
          title="Nachweise & Historie"
          subtitle="TÜV, Service und Reparaturen als ein gemeinsamer Verlauf statt getrennter leerer Tabellen."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-4">
          {evidenceSections.map((section) => (
            <EvidenceCard key={section.title} {...section} />
          ))}
        </div>
      </div>
    </div>
  );
}

function toneClass(tone: 'brand' | 'info' | 'success' | 'warning' | 'critical' | 'neutral') {
  if (tone === 'brand') return 'sq-tone-brand';
  if (tone === 'info') return 'sq-tone-info';
  if (tone === 'success') return 'sq-tone-success';
  if (tone === 'warning') return 'sq-tone-warning';
  if (tone === 'critical') return 'sq-tone-critical';
  return 'sq-tone-neutral';
}

function SummaryMetric({ label, value, tone }: { label: string; value: string; tone: 'success' | 'warning' | 'neutral' }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${toneClass(tone)}`}>
      <p className="text-[16px] leading-none font-bold tabular-nums">{value}</p>
      <p className="text-[9px] mt-1 font-semibold uppercase tracking-wider opacity-75">{label}</p>
    </div>
  );
}

function DocumentsSectionHeader({
  icon,
  fallbackIcon,
  title,
  subtitle,
}: {
  icon: string;
  fallbackIcon?: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="sq-tone-neutral w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
          <Icon name={icon || fallbackIcon || 'file-text'} className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">{title}</h4>
          <p className="text-[10px] mt-0.5 text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function DocumentTile({
  icon,
  title,
  description,
  action,
  tone,
}: {
  icon: string;
  title: string;
  description: string;
  action: string;
  tone: 'brand' | 'info' | 'success' | 'warning';
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toneClass(tone)}`}>
            <Icon name={icon} className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-foreground">{title}</p>
            <p className="text-[10px] mt-0.5 text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-amber-100 text-amber-700 shrink-0">Fehlt</span>
      </div>
      <button
        type="button"
        disabled
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card/70 px-2.5 py-2 text-[10px] font-semibold text-muted-foreground opacity-60 cursor-not-allowed"
      >
        <Icon name="upload" className="w-3.5 h-3.5" />
        {action}
      </button>
    </div>
  );
}

function CostRow({ label, value, tone }: { label: string; value: string; tone: 'info' | 'success' | 'warning' | 'neutral' }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${toneClass(tone)}`} />
        <span className="text-[10px] font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function EvidenceCard({
  title,
  subtitle,
  icon,
  tone,
  rows,
}: {
  title: string;
  subtitle: string;
  icon: string;
  tone: 'info' | 'success' | 'critical';
  rows: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 min-h-[150px] flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toneClass(tone)}`}>
          <Icon name={icon} className="w-4 h-4" />
        </div>
        <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{rows} Einträge</span>
      </div>
      <div className="mt-3">
        <p className="text-[11px] font-semibold text-foreground">{title}</p>
        <p className="text-[10px] mt-0.5 text-muted-foreground">{subtitle}</p>
      </div>
      <div className="mt-auto pt-4">
        {rows === 0 ? (
          <EmptyInline icon="file" text="Noch keine Nachweise hinterlegt" />
        ) : (
          <button type="button" className="text-[10px] font-semibold text-[color:var(--brand)]">Verlauf anzeigen</button>
        )}
      </div>
    </div>
  );
}

function EmptyInline({ icon, text }: { icon: string; text: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <Icon name={icon} className="w-3.5 h-3.5" />
      <span>{text}</span>
    </div>
  );
}
