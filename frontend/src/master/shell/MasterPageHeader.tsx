import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PageHeader, type PageHeaderVariant } from '../../components/patterns/page-header';
import { Button } from '../../components/ui/button';
import { cn } from '../../components/ui/utils';
import { MasterPageTabs, type MasterPageTab } from './MasterPageTabs';
import { MASTER_HEADER_TABS_GAP_CLASS } from './master-page-tokens';

export type MasterPageHeaderVariant = 'page' | 'context';

export interface MasterPageHeaderBackProps {
  label?: string;
  onBack: () => void;
}

export interface MasterPageHeaderProps<T extends string = string> {
  title: ReactNode;
  variant?: MasterPageHeaderVariant;
  eyebrow?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  back?: MasterPageHeaderBackProps;
  tabs?: MasterPageTab<T>[];
  activeTabId?: T;
  onTabChange?: (id: T) => void;
  tabsAriaLabel?: string;
  tabsTestIdPrefix?: string;
  className?: string;
  titleClassName?: string;
}

export function MasterPageHeader<T extends string = string>({
  title,
  variant = 'page',
  eyebrow,
  description,
  meta,
  icon,
  status,
  actions,
  back,
  tabs,
  activeTabId,
  onTabChange,
  tabsAriaLabel,
  tabsTestIdPrefix,
  className,
  titleClassName,
}: MasterPageHeaderProps<T>) {
  const pageVariant: PageHeaderVariant = variant === 'context' ? 'full' : 'page';

  return (
    <div className={cn('min-w-0', className)}>
      <div className={cn(back && 'flex gap-3 sm:gap-4')}>
        {back && (
          <div className="shrink-0 pt-0.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={back.onBack}
              aria-label={back.label ?? 'Zurück'}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <PageHeader
            variant={pageVariant}
            title={title}
            eyebrow={eyebrow}
            description={description}
            meta={meta}
            icon={icon}
            status={status}
            actions={actions}
            titleClassName={titleClassName}
            className="mb-0"
          />
        </div>
      </div>
      {tabs && activeTabId && onTabChange && tabsAriaLabel && (
        <div className={cn(MASTER_HEADER_TABS_GAP_CLASS, 'mt-3')}>
          <MasterPageTabs
            tabs={tabs}
            activeId={activeTabId}
            onChange={onTabChange}
            ariaLabel={tabsAriaLabel}
            testIdPrefix={tabsTestIdPrefix}
          />
        </div>
      )}
    </div>
  );
}
