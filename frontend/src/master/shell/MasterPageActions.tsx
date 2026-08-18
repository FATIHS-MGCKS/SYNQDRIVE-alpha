import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { cn } from '../../components/ui/utils';

export interface MasterPageOverflowItem {
  id: string;
  label: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface MasterPageActionsProps {
  primary?: ReactNode;
  secondary?: ReactNode[];
  overflow?: MasterPageOverflowItem[];
  className?: string;
}

export function MasterPageActions({ primary, secondary = [], overflow, className }: MasterPageActionsProps) {
  const visibleSecondary = secondary.filter(Boolean);

  return (
    <div className={cn('flex flex-wrap items-center gap-2 sm:justify-end', className)}>
      {visibleSecondary.map((action, index) => (
        <div key={index} className="shrink-0">
          {action}
        </div>
      ))}
      {overflow && overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Weitere Aktionen">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {overflow.map((item) => (
              <DropdownMenuItem
                key={item.id}
                disabled={item.disabled}
                variant={item.destructive ? 'destructive' : 'default'}
                onClick={item.onClick}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {primary && <div className="w-full shrink-0 sm:w-auto">{primary}</div>}
    </div>
  );
}
