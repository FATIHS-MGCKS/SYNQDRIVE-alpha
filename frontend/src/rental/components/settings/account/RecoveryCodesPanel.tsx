import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyTextToClipboard, downloadRecoveryCodes, formatRecoveryCodesForExport } from '@/lib/totp-utils';

type RecoveryCodesPanelProps = {
  codes: string[];
  requireConfirmation?: boolean;
  confirmed?: boolean;
  onConfirmedChange?: (confirmed: boolean) => void;
};

export function RecoveryCodesPanel({
  codes,
  requireConfirmation = false,
  confirmed = false,
  onConfirmedChange,
}: RecoveryCodesPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(formatRecoveryCodesForExport(codes));
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[color:var(--status-warning)]/25 bg-[color:var(--status-warning-soft)]/25 p-3">
        <p className="text-xs font-medium text-foreground">Wiederherstellungscodes</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Speichern Sie diese Codes an einem sicheren Ort. Jeder Code kann nur einmal verwendet werden,
          falls Sie keinen Zugriff auf Ihre Authenticator-App haben.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-1.5 rounded-xl border border-border/60 bg-muted/20 p-3 sm:grid-cols-2">
        {codes.map((code) => (
          <code
            key={code}
            className="rounded-lg bg-background/80 px-2.5 py-1.5 text-center font-mono text-xs tracking-wider text-foreground"
          >
            {code}
          </code>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? 'Kopiert' : 'Codes kopieren'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => downloadRecoveryCodes(codes)}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Herunterladen
        </Button>
      </div>

      {requireConfirmation ? (
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/60 p-3 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => onConfirmedChange?.(event.target.checked)}
            className="mt-0.5 rounded border-border"
          />
          <span>
            Ich habe die Wiederherstellungscodes sicher gespeichert und verstehe, dass sie nicht erneut
            angezeigt werden.
          </span>
        </label>
      ) : null}
    </div>
  );
}
