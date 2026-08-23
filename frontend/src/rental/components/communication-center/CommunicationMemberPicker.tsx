import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../../components/ui/command';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationOrgMember } from '../../../lib/communication/hooks/useCommunicationOrgMembers';
import { AssigneeAvatar } from '../tasks/task-display';

interface CommunicationMemberPickerProps {
  members: CommunicationOrgMember[];
  loading?: boolean;
  loadError?: boolean;
  currentUserId: string | null;
  selectedUserId: string | null;
  onSelect: (userId: string) => void;
  className?: string;
}

export function CommunicationMemberPicker({
  members,
  loading,
  loadError,
  currentUserId,
  selectedUserId,
  onSelect,
  className,
}: CommunicationMemberPickerProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalizedQuery) return members;
    return members.filter((member) =>
      member.displayName.toLowerCase().includes(normalizedQuery),
    );
  }, [members, normalizedQuery]);

  return (
    <Command className={cn('rounded-lg border-0 bg-transparent', className)} shouldFilter={false}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t('communication.ownership.searchMembers')}
        aria-label={t('communication.ownership.searchMembers')}
      />
      <CommandList className="max-h-56">
        {loading ? (
          <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
            {t('communication.ownership.loadingMembers')}
          </div>
        ) : loadError ? (
          <div className="px-3 py-4 text-center text-[12px] text-destructive" role="alert">
            {t('communication.ownership.membersLoadFailed')}
          </div>
        ) : (
          <>
            <CommandEmpty>{t('communication.ownership.noMatchingMembers')}</CommandEmpty>
            <CommandGroup>
              {filtered.map((member) => {
                const isSelected = member.id === selectedUserId;
                const isCurrentUser = member.id === currentUserId;
                return (
                  <CommandItem
                    key={member.id}
                    value={member.id}
                    onSelect={() => onSelect(member.id)}
                    className="flex items-center gap-2"
                  >
                    <AssigneeAvatar name={member.displayName} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {member.displayName}
                      {isCurrentUser && (
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          ({t('communication.ownership.you')})
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-[color:var(--brand)]" aria-hidden />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}
