import { Smartphone, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OperatorLinkCard } from './OperatorLinkCard';

export function OperatorDesktopOnlyNotice() {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl sq-tone-brand">
          <Smartphone className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-xl font-bold text-foreground">
            Operator App ist für mobile Endgeräte und Tablets optimiert
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Kopiere den Link und öffne ihn auf deinem Smartphone oder Tablet, um Übergaben,
            Rückgaben, Schäden und Fahrzeugchecks direkt am Fahrzeug durchzuführen.
          </p>
        </div>
        <OperatorLinkCard />
        <Link
          to="/rental"
          className="sq-press inline-flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Zurück zur SynqDrive App
        </Link>
      </div>
    </div>
  );
}
