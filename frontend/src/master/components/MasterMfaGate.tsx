import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { MfaStatus } from '../../lib/mfa';
import { MfaEnrollmentPanel } from '../../components/mfa/MfaEnrollmentPanel';

interface MasterMfaGateProps {
  children: React.ReactNode;
}

export function MasterMfaGate({ children }: MasterMfaGateProps) {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await api.account.mfa.status();
      setStatus(next);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Sicherheitsstatus wird geladen…
      </div>
    );
  }

  if (status?.enrollmentRequired && !status.enrolled) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <MfaEnrollmentPanel onEnrolled={refresh} />
      </div>
    );
  }

  return <>{children}</>;
}
