import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  PERMISSION_GROUPS,
  PERMISSION_MODULES,
  applyPermissionLevel,
  permissionLevelFrom,
  type PermissionLevel,
} from './constants';
import { permissionLevelLabel } from './utils';
import type { MembershipPermissionsMap } from '../../../lib/api';

const LEVELS: PermissionLevel[] = ['none', 'read', 'write', 'manage'];

interface PermissionEditorProps {
  permissions: MembershipPermissionsMap;
  onChange: (next: MembershipPermissionsMap) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function PermissionEditor({
  permissions,
  onChange,
  disabled,
  compact,
}: PermissionEditorProps) {
  const groups = useMemo(() => {
    const map = new Map<string, typeof PERMISSION_MODULES>();
    for (const m of PERMISSION_MODULES) {
      const list = map.get(m.group) ?? [];
      list.push(m);
      map.set(m.group, list);
    }
    return PERMISSION_GROUPS.map((g) => ({ group: g, modules: map.get(g) ?? [] })).filter(
      (g) => g.modules.length > 0,
    );
  }, []);

  const setLevel = (key: string, level: PermissionLevel) => {
    if (disabled) return;
    onChange({ ...permissions, [key]: applyPermissionLevel(level) });
  };

  return (
    <div className={`space-y-3 ${compact ? '' : 'max-h-[420px] overflow-y-auto pr-1'}`}>
      {groups.map(({ group, modules }) => (
        <div key={group} className="rounded-xl border border-border/70 overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {group}
          </div>
          <div className="divide-y divide-border/50">
            {modules.map((mod) => {
              const level = permissionLevelFrom(permissions[mod.key]);
              const Icon = mod.icon;
              return (
                <div
                  key={mod.key}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/20"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[12.5px] text-foreground truncate">{mod.label}</span>
                  </div>
                  <select
                    disabled={disabled}
                    value={level}
                    onChange={(e) => setLevel(mod.key, e.target.value as PermissionLevel)}
                    className="text-[11px] rounded-lg border border-border/70 bg-popover px-2 py-1.5 min-w-[120px]"
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {permissionLevelLabel(l)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PermissionPreview({
  permissions,
  title = 'Berechtigungsvorschau',
  className,
}: {
  permissions: MembershipPermissionsMap | null;
  title?: string;
  className?: string;
}) {
  const lines = useMemo(() => {
    if (!permissions) return ['Keine Berechtigungsdaten.'];
    const result: string[] = [];
    for (const mod of PERMISSION_MODULES) {
      const p = permissions[mod.key];
      const level = permissionLevelFrom(p);
      if (level === 'none') {
        result.push(`Darf ${mod.label} nicht nutzen`);
        continue;
      }
      if (level === 'manage') result.push(`Darf ${mod.label} vollständig verwalten`);
      else if (level === 'write') result.push(`Darf ${mod.label} sehen und bearbeiten`);
      else result.push(`Darf ${mod.label} nur lesen`);
    }
    return result.filter((l) => !l.includes('nicht nutzen')).slice(0, 12);
  }, [permissions]);

  return (
    <div className={`rounded-xl border border-border/70 bg-muted/20 p-4 ${className ?? ''}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </p>
      <ul className="space-y-1.5">
        {lines.length ? (
          lines.map((line) => (
            <li key={line} className="text-[12.5px] text-foreground leading-snug">
              {line}
            </li>
          ))
        ) : (
          <li className="text-[12.5px] text-muted-foreground">Kein Modulzugriff konfiguriert.</li>
        )}
      </ul>
    </div>
  );
}

export function CollapsiblePermissions({
  permissions,
  onChange,
  disabled,
}: {
  permissions: MembershipPermissionsMap;
  onChange?: (p: MembershipPermissionsMap) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-[13px] font-semibold text-foreground">Erweiterte Berechtigungen</span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3">
          <PermissionEditor
            permissions={permissions}
            onChange={onChange ?? (() => {})}
            disabled={disabled || !onChange}
          />
        </div>
      )}
    </div>
  );
}
