import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { operatorEntryAccessLoadingCheckingLabel } from '../lib/operator-entry-access-i18n';

export function OperatorAccessLoadingScreen({
  label,
}: {
  label?: string;
}) {
  const { locale } = useLanguage();
  const resolvedLabel = label ?? operatorEntryAccessLoadingCheckingLabel(locale);

  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background text-muted-foreground"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
      <p className="text-sm font-medium">{resolvedLabel}</p>
    </div>
  );
}
