import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';

interface TestEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TestEmailDialog({ open, onOpenChange }: TestEmailDialogProps) {
  const [toEmail, setToEmail] = useState('');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  const canSend = toEmail.trim().length > 3 && reason.trim().length >= 10;

  const send = async () => {
    setSending(true);
    try {
      const result = await api.admin.email.sendTest({
        toEmail: toEmail.trim(),
        reason: reason.trim(),
      });
      if (result.success) {
        toast.success(`Test-E-Mail gesendet (${result.status})`);
        onOpenChange(false);
        setToEmail('');
        setReason('');
      } else {
        toast.error(result.errorMessage || 'Test-E-Mail fehlgeschlagen');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Test-E-Mail fehlgeschlagen');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Test-E-Mail senden</DialogTitle>
          <DialogDescription>
            Sendet eine kontrollierte Test-E-Mail über den Plattform-Absender. Keine Kundenadressen verwenden.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 space-y-1">
            <div><span className="text-muted-foreground">Environment:</span> Live</div>
            <div><span className="text-muted-foreground">Wirkung:</span> Eine echte E-Mail wird versendet</div>
            <div><span className="text-muted-foreground">Kosten:</span> Kann Provider-Kosten verursachen</div>
          </div>
          <div>
            <label htmlFor="test-email-to" className="block font-semibold mb-1">Empfänger</label>
            <input
              id="test-email-to"
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className="w-full rounded-xl border bg-background px-3 py-2"
              placeholder="ihre-adresse@example.com"
            />
          </div>
          <div>
            <label htmlFor="test-email-reason" className="block font-semibold mb-1">Grund (min. 10 Zeichen)</label>
            <textarea
              id="test-email-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full min-h-[72px] rounded-xl border bg-background px-3 py-2"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Abbrechen
          </Button>
          <Button type="button" onClick={() => void send()} disabled={!canSend || sending}>
            {sending ? 'Senden…' : 'Test senden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
