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
  onOpenOperator?: () => void;
  desktopFallback?: boolean;
}

export function OperatorEntryModal({
  open,
  onOpenChange,
  onOpenOperator,
  desktopFallback = false,
}: OperatorEntryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Operator App</DialogTitle>
          <DialogDescription className="space-y-3 pt-1 text-left">
            <span className="block">
              Diese Oberfläche ist für mobile Endgeräte, Tablets und Touch-Terminals am Fahrzeug
              optimiert.
            </span>
            {desktopFallback ? (
              <span className="block text-muted-foreground">
                Auf dem Desktop steht ein Notfallzugriff in einer schmalen mobilen Arbeitsfläche zur
                Verfügung. Kamera-Funktionen nutzen ggf. Datei-Upload statt Live-Kamera.
              </span>
            ) : (
              <span className="block text-muted-foreground">
                Kopiere den Link und öffne ihn auf deinem Smartphone oder Tablet, um Übergaben,
                Rückgaben, Schäden und Fahrzeugchecks direkt am Fahrzeug durchzuführen.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <OperatorLinkCard />
        <DialogFooter className="gap-2 sm:gap-0">
          {desktopFallback && onOpenOperator && (
            <button
              type="button"
              onClick={onOpenOperator}
              className="sq-3d-btn sq-3d-btn--primary min-h-[44px] w-full font-semibold sm:w-auto"
            >
              Notfallzugriff öffnen
            </button>
          )}
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
