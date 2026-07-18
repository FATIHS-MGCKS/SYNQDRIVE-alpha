import type { ReactNode } from 'react';
import { DetailDrawer } from '../patterns';

export interface VoiceDetailDrawerShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  widthClassName?: string;
  closeLabel?: string;
  className?: string;
}

/**
 * Voice entity detail drawer — composes shared DetailDrawer with voice-friendly width.
 */
export function VoiceDetailDrawerShell({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  status,
  footer,
  children,
  widthClassName = 'sm:max-w-xl',
  closeLabel = 'Close',
  className,
}: VoiceDetailDrawerShellProps) {
  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      eyebrow={eyebrow}
      description={description}
      status={status}
      footer={footer}
      widthClassName={widthClassName}
      closeLabel={closeLabel}
      surface="solid"
      footerSurface="frosted"
      className={className}
    >
      {children}
    </DetailDrawer>
  );
}
