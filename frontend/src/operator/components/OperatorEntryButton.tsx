import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../rental/components/ui/Icon';
import { canAccessOperatorApp } from '../lib/operatorAccess';
import { OPERATOR_BASE_PATH } from '../lib/operatorRoutes';
import { useIsOperatorDevice } from '../hooks/useIsOperatorDevice';
import { OperatorEntryModal } from './OperatorEntryModal';

interface OperatorEntryButtonProps {
  className?: string;
}

export function OperatorEntryButton({ className = '' }: OperatorEntryButtonProps) {
  const navigate = useNavigate();
  const isOperatorDevice = useIsOperatorDevice();
  const [modalOpen, setModalOpen] = useState(false);

  if (!canAccessOperatorApp()) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isOperatorDevice) {
            navigate(OPERATOR_BASE_PATH);
            return;
          }
          setModalOpen(true);
        }}
        className={`sq-press inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors hover:bg-muted text-muted-foreground hover:text-foreground ${className}`}
        title="Operator App — mobile field operations"
      >
        <Icon name="smartphone" className="w-3.5 h-3.5" />
        <span>Operator</span>
      </button>
      <OperatorEntryModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
