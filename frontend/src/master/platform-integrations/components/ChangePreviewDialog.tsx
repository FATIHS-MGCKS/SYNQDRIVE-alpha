import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';

interface ChangePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  current: string;
  proposed: string;
  scope: string;
  impact: string;
  effectiveTime: string;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  confirming?: boolean;
  requireReason?: boolean;
}

export function ChangePreviewDialog({
  open,
  onOpenChange,
  title,
  current,
  proposed,
  scope,
  impact,
  effectiveTime,
  reason,
  onReasonChange,
  onConfirm,
  confirming,
  requireReason,
}: ChangePreviewDialogProps) {
  const canConfirm = !requireReason || reason.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Bitte prüfen Sie die Auswirkung vor dem Speichern.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-muted-foreground">Aktuell</div>
            <div className="font-medium">{current}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Geplant</div>
            <div className="font-medium">{proposed}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Scope</div>
            <div>{scope}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Auswirkung</div>
            <div>{impact}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Wirksam</div>
            <div>{effectiveTime}</div>
          </div>
          <div>
            <label htmlFor="change-reason" className="block text-muted-foreground mb-1">
              Grund {requireReason ? '(Pflicht, min. 10 Zeichen)' : '(optional)'}
            </label>
            <textarea
              id="change-reason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              className="w-full min-h-[80px] rounded-xl border bg-background px-3 py-2 text-sm"
              placeholder="Warum wird diese Änderung vorgenommen?"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={confirming}>
            Abbrechen
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!canConfirm || confirming}>
            {confirming ? 'Speichern…' : 'Bestätigen & speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
