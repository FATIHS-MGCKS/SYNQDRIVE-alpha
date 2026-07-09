import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function VerificationDonePage() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.close();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full rounded-lg border border-border surface-premium p-6 text-center space-y-3">
        <h1 className="text-lg font-semibold text-foreground">Dokumentenprüfung abgeschlossen</h1>
        <p className="text-sm text-muted-foreground">
          Sie können dieses Fenster schließen und in SynqDrive den Status aktualisieren.
        </p>
        <Link to="/rental" className="inline-block text-sm font-semibold text-[color:var(--brand)]">
          Zurück zu SynqDrive
        </Link>
      </div>
    </div>
  );
}
