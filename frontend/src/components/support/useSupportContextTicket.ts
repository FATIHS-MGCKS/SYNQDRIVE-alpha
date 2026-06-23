import { useCallback, useMemo, useState } from 'react';
import type { SupportTicket } from '../../lib/api';
import { useRentalOrg } from '../../rental/RentalContext';
import { buildSupportContextPreset } from './support-context';
import type { SupportContextKind, SupportTicketDialogDefaults } from './support.types';

export function useSupportContextTicket(
  kind: SupportContextKind,
  contextData: Record<string, unknown> = {},
) {
  const { orgId } = useRentalOrg();
  const [open, setOpen] = useState(false);
  const [helpCenterAttempted, setHelpCenterAttempted] = useState(false);

  const preset = useMemo(() => buildSupportContextPreset(kind, contextData), [kind, contextData]);

  const dialogDefaults: SupportTicketDialogDefaults = useMemo(
    () => ({
      defaultCategory: preset.category,
      defaultPriority: preset.defaultPriority,
      relatedEntityType: preset.relatedEntityType,
      relatedEntityId: preset.relatedEntityId,
      sourcePage: preset.sourcePage,
      metadata: preset.metadata,
      helpCenterAttempted,
    }),
    [preset, helpCenterAttempted],
  );

  const openDialog = useCallback(() => setOpen(true), []);
  const closeDialog = useCallback(() => setOpen(false), []);

  const onCreated = useCallback((_ticket: SupportTicket) => {
    setOpen(false);
  }, []);

  return {
    orgId: orgId ?? '',
    open,
    setOpen,
    openDialog,
    closeDialog,
    preset,
    dialogDefaults,
    helpCenterAttempted,
    setHelpCenterAttempted,
    onCreated,
  };
}
