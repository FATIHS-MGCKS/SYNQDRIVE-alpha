import { useState } from 'react';
import { ChevronDown, UserCheck, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationHumanActions } from '../../../lib/communication/communication-human-actions';
import type { CommunicationOrgMember } from '../../../lib/communication/hooks/useCommunicationOrgMembers';
import type { CommunicationConversationMutation } from '../../../lib/communication/hooks/useCommunicationConversationActions';
import { AssigneeAvatar } from '../tasks/task-display';
import { CommunicationMemberPicker } from './CommunicationMemberPicker';

interface CommunicationAssigneeControlProps {
  humanActions: CommunicationHumanActions;
  currentUserId: string | null;
  pendingAction: CommunicationConversationMutation | null;
  disabled?: boolean;
  members: CommunicationOrgMember[];
  membersLoading: boolean;
  membersLoadError: boolean;
  selectedUserId: string | null;
  onEnsureMembersLoaded: () => void;
  onClaim: () => void;
  onTakeOverSelf: () => void;
  onAssign: (userId: string) => void;
  onUnassign: () => void;
}

export function CommunicationAssigneeControl({
  humanActions,
  currentUserId,
  pendingAction,
  disabled = false,
  members,
  membersLoading,
  membersLoadError,
  selectedUserId,
  onEnsureMembersLoaded,
  onClaim,
  onTakeOverSelf,
  onAssign,
  onUnassign,
}: CommunicationAssigneeControlProps) {
  const { t } = useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const isPending = pendingAction != null;
  const isBusy = disabled || isPending;

  const ownershipLabel = (() => {
    switch (humanActions.ownershipKind) {
      case 'assigned_to_me':
        return t('communication.ownership.assignedToYou');
      case 'assigned_to_other':
        return humanActions.assigneeDisplayName ?? t('communication.ownership.unknownUser');
      case 'resolved':
        return t('communication.status.RESOLVED');
      case 'failed':
        return t('communication.status.FAILED');
      case 'non_human':
        return t('communication.ownership.unassigned');
      default:
        return t('communication.ownership.unassigned');
    }
  })();

  const showTakeOverButton = humanActions.canClaim || humanActions.canTakeOverSelf;
  const showOwnershipMenu =
    humanActions.canOpenMemberPicker
    || humanActions.canUnassign
    || humanActions.ownershipKind === 'assigned_to_me'
    || humanActions.ownershipKind === 'assigned_to_other';

  const handleTakeOver = () => {
    if (humanActions.canClaim) {
      onClaim();
      return;
    }
    if (humanActions.canTakeOverSelf) {
      onTakeOverSelf();
    }
  };

  const handleAssign = (userId: string) => {
    if (userId === selectedUserId) {
      setPickerOpen(false);
      return;
    }
    onAssign(userId);
    setPickerOpen(false);
  };

  const openPicker = () => {
    onEnsureMembersLoaded();
    setPickerOpen(true);
  };

  const picker = (
    <CommunicationMemberPicker
      members={members}
      loading={membersLoading}
      loadError={membersLoadError}
      currentUserId={currentUserId}
      selectedUserId={selectedUserId}
      onSelect={handleAssign}
    />
  );

  if (showTakeOverButton) {
    return (
      <Button
        type="button"
        size="sm"
        className="h-8 shrink-0"
        disabled={isBusy}
        aria-busy={pendingAction === 'claim' || pendingAction === 'assign'}
        onClick={handleTakeOver}
        data-testid="communication-ownership-takeover"
      >
        {pendingAction === 'claim' || pendingAction === 'assign'
          ? t('communication.actions.claiming')
          : t('communication.actions.claim')}
      </Button>
    );
  }

  if (!showOwnershipMenu && humanActions.isTerminal) {
    return (
      <span
        className="inline-flex max-w-[10rem] items-center gap-1.5 truncate text-[11px] text-muted-foreground"
        data-testid="communication-ownership-display"
      >
        <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{ownershipLabel}</span>
      </span>
    );
  }

  if (!showOwnershipMenu) {
    return (
      <span
        className="inline-flex max-w-[10rem] items-center gap-1.5 truncate text-[11px] text-muted-foreground"
        data-testid="communication-ownership-display"
      >
        {humanActions.assigneeDisplayName ? (
          <AssigneeAvatar name={humanActions.assigneeDisplayName} />
        ) : (
          <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <span className="truncate">{ownershipLabel}</span>
      </span>
    );
  }

  const menuItems = (
    <>
      {humanActions.canOpenMemberPicker && (
        <DropdownMenuItem onSelect={openPicker}>
          <UserPlus className="mr-2 h-3.5 w-3.5" aria-hidden />
          {humanActions.ownershipKind === 'assigned_to_other'
            ? t('communication.ownership.reassign')
            : t('communication.ownership.assign')}
        </DropdownMenuItem>
      )}
      {humanActions.canUnassign && (
        <DropdownMenuItem
          onSelect={() => onUnassign()}
          disabled={isBusy}
        >
          <UserMinus className="mr-2 h-3.5 w-3.5" aria-hidden />
          {t('communication.ownership.unassign')}
        </DropdownMenuItem>
      )}
    </>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-8 max-w-[11rem] shrink-0 justify-between gap-1 px-2')}
            disabled={isBusy}
            aria-label={t('communication.ownership.controlLabel', { name: ownershipLabel })}
            data-testid="communication-ownership-control"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {humanActions.assigneeDisplayName ? (
                <AssigneeAvatar name={humanActions.assigneeDisplayName} />
              ) : (
                <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <span className="truncate text-[11px]">{ownershipLabel}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {menuItems}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md gap-0 p-0">
          <DialogHeader className="border-b border-border/40 px-4 py-3 text-left">
            <DialogTitle className="text-[15px]">{t('communication.ownership.assignTitle')}</DialogTitle>
          </DialogHeader>
          <div className="p-2">{picker}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
