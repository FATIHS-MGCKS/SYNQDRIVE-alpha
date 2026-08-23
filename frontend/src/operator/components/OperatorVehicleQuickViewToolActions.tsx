import { Disc3, ListTodo, ShieldAlert, Sparkles } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  operatorVehicleQuickViewToolActionAiUploadSubtitle,
  operatorVehicleQuickViewToolActionAiUploadTitle,
  operatorVehicleQuickViewToolActionDamageCaptureSubtitle,
  operatorVehicleQuickViewToolActionDamageCaptureTitle,
  operatorVehicleQuickViewToolActionTaskCreateSubtitle,
  operatorVehicleQuickViewToolActionTaskCreateTitle,
  operatorVehicleQuickViewToolActionTireMeasureSubtitle,
  operatorVehicleQuickViewToolActionTireMeasureTitle,
} from '../lib/operator-vehicle-quick-view-i18n';

export interface OperatorVehicleQuickViewToolActionsProps {
  onDamageCapture: () => void;
  onAiUpload: () => void;
  onTireMeasure: () => void;
  onTaskCreate: () => void;
}

function ActionButton({
  icon,
  title,
  subtitle,
  onClick,
  highlight,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`sq-press flex min-h-[48px] items-center gap-3 rounded-xl border px-4 text-left ${
        highlight
          ? 'border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)]/50'
          : 'border-border/60 surface-premium'
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          highlight
            ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

export function OperatorVehicleQuickViewToolActions({
  onDamageCapture,
  onAiUpload,
  onTireMeasure,
  onTaskCreate,
}: OperatorVehicleQuickViewToolActionsProps) {
  const { locale } = useLanguage();

  return (
    <div className="grid gap-2">
      <ActionButton
        icon={<ShieldAlert className="h-4 w-4" />}
        title={operatorVehicleQuickViewToolActionDamageCaptureTitle(locale)}
        subtitle={operatorVehicleQuickViewToolActionDamageCaptureSubtitle(locale)}
        highlight
        onClick={onDamageCapture}
      />
      <ActionButton
        icon={<Sparkles className="h-4 w-4" />}
        title={operatorVehicleQuickViewToolActionAiUploadTitle(locale)}
        subtitle={operatorVehicleQuickViewToolActionAiUploadSubtitle(locale)}
        onClick={onAiUpload}
      />
      <ActionButton
        icon={<Disc3 className="h-4 w-4" />}
        title={operatorVehicleQuickViewToolActionTireMeasureTitle(locale)}
        subtitle={operatorVehicleQuickViewToolActionTireMeasureSubtitle(locale)}
        onClick={onTireMeasure}
      />
      <ActionButton
        icon={<ListTodo className="h-4 w-4" />}
        title={operatorVehicleQuickViewToolActionTaskCreateTitle(locale)}
        subtitle={operatorVehicleQuickViewToolActionTaskCreateSubtitle(locale)}
        onClick={onTaskCreate}
      />
    </div>
  );
}
