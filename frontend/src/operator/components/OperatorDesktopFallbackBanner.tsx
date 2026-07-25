import { MonitorSmartphone } from 'lucide-react';

export function OperatorDesktopFallbackBanner() {
  return (
    <div
      className="shrink-0 border-b border-[color:var(--status-watch)]/25 bg-[color:var(--status-watch)]/10 px-4 py-2.5"
      role="status"
    >
      <div className="mx-auto flex max-w-[430px] items-start gap-2">
        <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-watch)]" aria-hidden />
        <p className="text-[11px] leading-relaxed text-[color:var(--status-watch)]">
          Notfallzugriff auf dem Desktop — für Übergaben am Fahrzeug ist ein Tablet oder Smartphone
          empfohlen. Kamera-Funktionen nutzen ggf. Datei-Upload statt Live-Kamera.
        </p>
      </div>
    </div>
  );
}
