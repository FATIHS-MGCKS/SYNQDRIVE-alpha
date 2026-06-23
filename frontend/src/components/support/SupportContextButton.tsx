import { Headphones } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { CreateSupportTicketDialog } from './CreateSupportTicketDialog';
import { buildSupportContextPreset } from './support-context';
import type { SupportContextKind } from './support.types';
import { useSupportContextTicket } from './useSupportContextTicket';

export interface SupportContextButtonProps {
  kind: SupportContextKind;
  contextData?: Record<string, unknown>;
  label?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  onOpenHelpCenter?: () => void;
  onCreated?: () => void;
}

export function SupportContextButton({
  kind,
  contextData = {},
  label,
  variant = 'outline',
  size = 'sm',
  className,
  onOpenHelpCenter,
  onCreated,
}: SupportContextButtonProps) {
  const preset = buildSupportContextPreset(kind, contextData);
  const ctx = useSupportContextTicket(kind, contextData);

  if (!ctx.orgId) return null;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn('gap-1.5', className)}
        onClick={ctx.openDialog}
      >
        <Headphones className="h-3.5 w-3.5" />
        {label ?? preset.label}
      </Button>

      <CreateSupportTicketDialog
        open={ctx.open}
        onOpenChange={ctx.setOpen}
        orgId={ctx.orgId}
        defaultCategory={ctx.dialogDefaults.defaultCategory}
        defaultPriority={ctx.dialogDefaults.defaultPriority}
        relatedEntityType={ctx.dialogDefaults.relatedEntityType}
        relatedEntityId={ctx.dialogDefaults.relatedEntityId}
        sourcePage={ctx.dialogDefaults.sourcePage}
        metadata={ctx.dialogDefaults.metadata}
        helpCenterAttempted={ctx.dialogDefaults.helpCenterAttempted}
        aiTriage={ctx.dialogDefaults.aiTriage}
        onOpenHelpCenter={onOpenHelpCenter}
        onCreated={(ticket) => {
          ctx.onCreated(ticket);
          onCreated?.();
        }}
      />
    </>
  );
}
