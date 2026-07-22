import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import { useRentalOrg } from '../RentalContext';

export function OrganizationSwitcher() {
  const {
    orgId,
    orgName,
    availableOrganizations,
    switchingOrganization,
    switchOrganization,
  } = useRentalOrg();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  if (!orgId || availableOrganizations.length <= 1) {
    if (!orgName) return null;
    return (
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-[color:var(--input-background)] text-xs text-foreground max-w-[220px]">
        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="truncate font-medium">{orgName}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={switchingOrganization}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-[color:var(--input-background)] text-xs text-foreground hover:border-[color:var(--brand)] transition-colors max-w-[240px] disabled:opacity-70"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="w-3.5 h-3.5 text-[color:var(--brand)] shrink-0" />
        <span className="truncate font-medium">{orgName || 'Organization'}</span>
        {switchingOrganization ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border bg-popover shadow-[var(--shadow-2)] z-50 overflow-hidden"
          role="listbox"
          aria-label="Switch organization"
        >
          <div className="px-3 py-2 border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
            Active organization
          </div>
          {availableOrganizations.map((org) => {
            const active = org.organizationId === orgId;
            return (
              <button
                key={org.organizationId}
                type="button"
                role="option"
                aria-selected={active}
                disabled={active || switchingOrganization}
                onClick={async () => {
                  setOpen(false);
                  if (!active) {
                    await switchOrganization(org.organizationId);
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs transition-colors ${
                  active
                    ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                    : 'hover:bg-muted text-foreground'
                } disabled:cursor-default`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {org.organizationName || org.organizationId}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{org.role}</div>
                </div>
                {active && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
