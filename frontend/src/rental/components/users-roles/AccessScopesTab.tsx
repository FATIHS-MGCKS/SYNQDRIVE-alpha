import { MapPin, Smartphone, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState, ErrorState, MetricCard, SectionHeader, SkeletonMetricGrid } from '../../../components/patterns';
import type { OrgUserDto, Station } from '../../../lib/api';
import { isScopedUser, userDisplayRole, userStationLabel } from './utils';

interface AccessScopesTabProps {
  users: OrgUserDto[];
  stations: Station[];
  stationNameById: Map<string, string>;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectUser?: (user: OrgUserDto) => void;
}

export function AccessScopesTab({
  users,
  stations,
  stationNameById,
  loading = false,
  error = null,
  onRetry,
  onSelectUser,
}: AccessScopesTabProps) {
  const [stationFilter, setStationFilter] = useState<string>('all');

  const allStationUsers = useMemo(
    () => users.filter((u) => !isScopedUser(u)),
    [users],
  );
  const scopedUsers = useMemo(
    () => users.filter((u) => isScopedUser(u)),
    [users],
  );
  const fieldAgents = useMemo(
    () => users.filter((u) => u.fieldAgentAccess),
    [users],
  );

  const usersByStation = useMemo(() => {
    const map = new Map<string, OrgUserDto[]>();
    for (const station of stations) {
      map.set(station.id, []);
    }
    for (const user of users) {
      const ids = user.stationIds ?? [];
      if (ids.length) {
        for (const id of ids) {
          const list = map.get(id) ?? [];
          list.push(user);
          map.set(id, list);
        }
      } else if (user.stationScope?.trim()) {
        const match = stations.find(
          (s) => s.name.toLowerCase() === user.stationScope!.toLowerCase(),
        );
        if (match) {
          const list = map.get(match.id) ?? [];
          list.push(user);
          map.set(match.id, list);
        }
      }
    }
    return map;
  }, [users, stations]);

  const filteredStationUsers = useMemo(() => {
    if (stationFilter === 'all') return [];
    return usersByStation.get(stationFilter) ?? [];
  }, [stationFilter, usersByStation]);

  if (error && !users.length && !stations.length) {
    return (
      <ErrorState
        title="Zugriffsbereiche konnten nicht geladen werden"
        error={error}
        onRetry={onRetry}
        retryLabel="Erneut laden"
      />
    );
  }

  if (loading && !users.length) {
    return (
      <div className="space-y-4">
        <SkeletonMetricGrid count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard label="Alle Stationen" value={allStationUsers.length} icon={<Users className="w-4 h-4" />} />
        <MetricCard label="Eingeschränkter Zugriff" value={scopedUsers.length} status="warning" icon={<MapPin className="w-4 h-4" />} />
        <MetricCard label="Übergabe-Mitarbeiter" value={fieldAgents.length} status="info" icon={<Smartphone className="w-4 h-4" />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
          <SectionHeader title="Stationen & Benutzer" />
          {stations.length === 0 ? (
            <EmptyState compact title="Keine Stationen" description="Legen Sie Stationen an, um Scopes zuzuordnen." />
          ) : (
            <div className="mt-3 space-y-2">
              <select
                value={stationFilter}
                onChange={(e) => setStationFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border text-[13px]"
              >
                <option value="all">Station filtern…</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({(usersByStation.get(s.id) ?? []).length} Benutzer)
                  </option>
                ))}
              </select>
              {stationFilter !== 'all' && (
                <ul className="divide-y divide-border/50 rounded-xl border border-border/60 overflow-hidden">
                  {filteredStationUsers.length === 0 ? (
                    <li className="p-3 text-[12px] text-muted-foreground">Keine Benutzer für diese Station.</li>
                  ) : (
                    filteredStationUsers.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2.5 hover:bg-muted/30 transition-colors"
                          onClick={() => onSelectUser?.(u)}
                        >
                          <p className="text-[13px] font-medium">{u.name}</p>
                          <p className="text-[11px] text-muted-foreground">{userDisplayRole(u)}</p>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
          <SectionHeader title="Übersicht nach Zugriffstyp" />
          <div className="mt-3 space-y-4">
            <ScopeList
              title="Organisationsweiter Zugriff"
              users={allStationUsers}
              stationNameById={stationNameById}
              onSelectUser={onSelectUser}
            />
            <ScopeList
              title="Eingeschränkter Standortzugriff"
              users={scopedUsers}
              stationNameById={stationNameById}
              onSelectUser={onSelectUser}
            />
            <ScopeList
              title="Übergabe / Field Agent"
              users={fieldAgents}
              stationNameById={stationNameById}
              onSelectUser={onSelectUser}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScopeList({
  title,
  users,
  stationNameById,
  onSelectUser,
}: {
  title: string;
  users: OrgUserDto[];
  stationNameById: Map<string, string>;
  onSelectUser?: (user: OrgUserDto) => void;
}) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-foreground mb-1">{title}</p>
      {users.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Keine Benutzer.</p>
      ) : (
        <ul className="space-y-1 max-h-40 overflow-y-auto">
          {users.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="w-full text-left text-[12px] px-2 py-1.5 rounded-lg hover:bg-muted/40"
                onClick={() => onSelectUser?.(u)}
              >
                <span className="font-medium">{u.name}</span>
                <span className="text-muted-foreground"> · {userStationLabel(u, stationNameById)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
