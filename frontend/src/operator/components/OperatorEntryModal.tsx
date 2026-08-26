import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  operatorEntryAccessAppName,
  operatorEntryAccessCloseLabel,
  operatorEntryAccessModalInstructionsLine,
  operatorEntryAccessModalOptimizeLine,
} from '../lib/operator-entry-access-i18n';
import { OperatorLinkCard } from './OperatorLinkCard';

interface OperatorEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OperatorEntryModal({ open, onOpenChange }: OperatorEntryModalProps) {
  const { locale } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{operatorEntryAccessAppName(locale)}</DialogTitle>
          <DialogDescription className="text-left space-y-3 pt-1">
            <span className="block">{operatorEntryAccessModalOptimizeLine(locale)}</span>
            <span className="block text-muted-foreground">
              {operatorEntryAccessModalInstructionsLine(locale)}
            </span>
          </DialogDescription>
        </DialogHeader>
        <OperatorLinkCard />
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="sq-press rounded-xl border border-border px-4 py-2 text-xs font-semibold"
          >
            {operatorEntryAccessCloseLabel(locale)}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
