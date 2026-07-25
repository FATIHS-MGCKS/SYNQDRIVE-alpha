import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../rental/components/ui/Icon';
import { canAccessOperatorApp } from '../lib/operatorAccess';
import { OPERATOR_BASE_PATH } from '../lib/operatorRoutes';
import { useOperatorDeviceCapabilities } from '../hooks/useOperatorDeviceCapabilities';
import { OperatorEntryModal } from './OperatorEntryModal';

interface OperatorEntryButtonProps {
  className?: string;
}

export function OperatorEntryButton({ className = '' }: OperatorEntryButtonProps) {
  const navigate = useNavigate();
  const capabilities = useOperatorDeviceCapabilities();
  const [modalOpen, setModalOpen] = useState(false);

  if (!canAccessOperatorApp()) return null;

  const openOperator = () => {
    setModalOpen(false);
    navigate(OPERATOR_BASE_PATH);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (capabilities.showDesktopFallbackBanner) {
            setModalOpen(true);
            return;
          }
          navigate(OPERATOR_BASE_PATH);
        }}
        className={`sq-press inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors hover:bg-muted text-muted-foreground hover:text-foreground ${className}`}
        title="Operator App — mobile field operations"
      >
        <Icon name="smartphone" className="w-3.5 h-3.5" />
        <span>Operator</span>
      </button>
      <OperatorEntryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onOpenOperator={openOperator}
        desktopFallback
      />
    </>
  );
}
