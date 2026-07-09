import { ArrowLeft, LogIn, ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/patterns';
import {
  operatorAccessDenialMessage,
} from '../lib/operatorAccess';
import type { OperatorAccessDenialReason } from '../lib/operatorAccess.types';

interface Props {
  reason: OperatorAccessDenialReason;
}

export function OperatorAccessDeniedScreen({ reason }: Props) {
  const copy = operatorAccessDenialMessage(reason);

  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 py-10"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="w-full max-w-md">
        <EmptyState
          icon={<ShieldX className="h-5 w-5" />}
          title={copy.title}
          description={copy.description}
          action={
            <div className="flex flex-col items-center gap-2">
              {reason === 'unauthenticated' ? (
                <Link
                  to="/login"
                  state={{ from: '/operator' }}
                  className="sq-press inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[color:var(--brand)] px-5 text-sm font-semibold text-white"
                >
                  <LogIn className="h-4 w-4" />
                  Zur Anmeldung
                </Link>
              ) : (
                <Link
                  to="/rental"
                  className="sq-press inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border surface-premium px-5 text-sm font-semibold"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Zur SynqDrive App
                </Link>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
