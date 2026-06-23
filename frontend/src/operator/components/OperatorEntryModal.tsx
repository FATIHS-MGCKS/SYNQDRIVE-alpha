import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { OperatorLinkCard } from './OperatorLinkCard';

interface OperatorEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OperatorEntryModal({ open, onOpenChange }: OperatorEntryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Operator App</DialogTitle>
          <DialogDescription className="text-left space-y-3 pt-1">
            <span className="block">
              Diese Oberfläche ist für mobile Endgeräte und Tablets optimiert.
            </span>
            <span className="block text-muted-foreground">
              Kopiere den Link und öffne ihn auf deinem Smartphone oder Tablet, um Übergaben,
              Rückgaben, Schäden und Fahrzeugchecks direkt am Fahrzeug durchzuführen.
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
            Schließen
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
