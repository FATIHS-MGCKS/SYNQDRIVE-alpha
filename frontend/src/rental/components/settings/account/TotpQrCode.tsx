import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { cn } from '@/components/ui/utils';

type TotpQrCodeProps = {
  otpauthUrl: string;
  size?: number;
  className?: string;
};

export function TotpQrCode({ otpauthUrl, size = 180, className }: TotpQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void QRCode.toDataURL(otpauthUrl, {
      width: size,
      margin: 1,
      color: { dark: '#111111', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl(null);
          setError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [otpauthUrl, size]);

  if (error) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-xl border border-border/60 bg-muted/30 p-4 text-center text-xs text-muted-foreground',
          className,
        )}
        style={{ width: size, height: size }}
      >
        QR-Code konnte nicht erzeugt werden. Nutzen Sie den Schlüssel manuell.
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div
        className={cn(
          'animate-pulse rounded-xl border border-border/60 bg-muted/40',
          className,
        )}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR-Code für Authenticator-App"
      className={cn('rounded-xl border border-border/60 bg-white p-2', className)}
      width={size}
      height={size}
    />
  );
}
