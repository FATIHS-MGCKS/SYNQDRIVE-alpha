#!/usr/bin/env python3
"""
Read-only VPS IAM integrity audit (Prompt 4).

SAFETY:
  - SELECT-only via psql (never UPDATE/DELETE/INSERT)
  - Never prints emails, names, IPs, user agents, tokens, hashes, or raw UUIDs
  - Emits anonymized aliases ORG_00N / USER_00N / MEMBERSHIP_00N / ROLE_00N / INVITE_00N
  - Does not revoke sessions, reconcile roles, update memberships, or act on invites

Usage:
  DATABASE_URL=... USERS_ROLES_AUDIT_ALLOW_REMOTE=1 USERS_ROLES_AUDIT_ALLOW_PROD=1 \
    python3 scripts/audits/iam-vps-integrity-readonly.py > /tmp/iam-vps-anonymized.json

Environment gates (enforced below):
  USERS_ROLES_AUDIT_ALLOW_REMOTE=1 and USERS_ROLES_AUDIT_ALLOW_PROD=1 for non-local URLs
  Any *_ALLOW_WRITE / ALLOW_IAM_MUTATIONS=1 refuses to run

Stdout: single anonymized JSON document (feed into report CSV builders / phase-4 artifacts).
"""
import os, json, subprocess
from datetime import datetime, timezone, timedelta
from collections import defaultdict, Counter

def q(sql: str):
    proc = subprocess.run(
        ["psql", os.environ["DATABASE_URL"], "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql],
        check=True, capture_output=True, text=True,
    )
    return [line.split("\t") for line in proc.stdout.splitlines() if line.strip()]

def parse_ts(s):
    if not s: return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None

def parse_json_maybe(s):
    if not s: return None
    try: return json.loads(s)
    except Exception: return None


def _assert_read_only_env():
    for key in ("USERS_ROLES_AUDIT_ALLOW_WRITE", "IAM_AUDIT_ALLOW_WRITE", "ALLOW_IAM_MUTATIONS"):
        if os.environ.get(key) in ("1", "true", "TRUE"):
            raise SystemExit(f"{key} is set — refusing to run (read-only only).")
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is required")
    local = any(x in url for x in ("localhost", "127.0.0.1", "@postgres:"))
    remote = os.environ.get("USERS_ROLES_AUDIT_ALLOW_REMOTE") == "1"
    prod = os.environ.get("USERS_ROLES_AUDIT_ALLOW_PROD") == "1"
    if not local and not (remote and prod):
        raise SystemExit(
            "Non-local DATABASE_URL requires USERS_ROLES_AUDIT_ALLOW_REMOTE=1 and USERS_ROLES_AUDIT_ALLOW_PROD=1"
        )
    # strip prisma schema query param for libpq
    os.environ["DATABASE_URL"] = (
        __import__("re").sub(r"[?&]schema=[^&]*", "", url).replace("?&", "?").rstrip("?&")
    )

_assert_read_only_env()

KNOWN = {
  'dashboard','bookings','fleet','customers','stations','fleet-condition','invoices','fines',
  'price-tariffs','tasks','vendor-management','ai-assistant','workflow-automation','document-upload',
  'company-info','users-roles','fleet-connectivity','data-analyse','data-authorization','billing',
  'support','payments','payments-refund','payments-disputes','payments-connect','payments-settings'
}

def is_privileged_role(perm, membership_role):
    if membership_role == 'ORG_ADMIN': return True
    p = parse_json_maybe(perm) if isinstance(perm, str) else (perm or {})
    if not isinstance(p, dict): return False
    ur = p.get('users-roles') or {}
    billing = p.get('billing') or {}
    return ur.get('manage') is True or billing.get('manage') is True

nowdt = datetime.now(timezone.utc)
orgs = q("SELECT id::text, created_at::text, status::text FROM organizations ORDER BY created_at ASC, id ASC;")
users = q("""SELECT id::text, status::text, platform_role::text, (password_hash IS NOT NULL)::text, must_change_password::text,
 created_at::text, updated_at::text, last_login_at::text FROM users ORDER BY created_at ASC, id ASC;""")
memberships = q("""SELECT m.id::text, m.user_id::text, m.organization_id::text, m.role::text, m.status::text,
 coalesce(m.organization_role_id::text,''), (m.permissions IS NOT NULL)::text, coalesce(m.station_scope,''),
 (m.station_ids IS NOT NULL)::text, m.field_agent_access::text, m.created_at::text, m.updated_at::text,
 coalesce(m.permissions::text,''), coalesce(m.station_ids::text,'') FROM organization_memberships m
 ORDER BY m.created_at ASC, m.id ASC;""")
roles = q("""SELECT r.id::text, r.organization_id::text, coalesce(r.system_key,''), r.is_system_template::text,
 r.is_active::text, r.membership_role::text, coalesce(r.station_scope_default,''),
 (r.default_station_ids IS NOT NULL)::text, r.field_agent_access_default::text, r.created_at::text,
 r.updated_at::text, coalesce(r.permissions::text,''), coalesce(r.default_station_ids::text,'')
 FROM organization_roles r ORDER BY r.created_at ASC, r.id ASC;""")
invites = q("""SELECT i.id::text, i.organization_id::text, i.status::text, i.membership_role::text,
 coalesce(i.organization_role_id::text,''), i.expires_at::text, i.created_at::text, i.updated_at::text,
 coalesce(i.accepted_at::text,''), coalesce(i.revoked_at::text,''), coalesce(i.accepted_by_user_id::text,''),
 (i.permissions IS NOT NULL)::text, coalesce(i.station_scope,''), (i.station_ids IS NOT NULL)::text,
 i.field_agent_access::text, length(i.email)::text, (lower(i.email)=i.email)::text
 FROM organization_user_invites i ORDER BY i.created_at ASC, i.id ASC;""")
refresh = q("""SELECT id::text, user_id::text, family::text, expires_at::text, coalesce(revoked_at::text,''),
 coalesce(replaced_by::text,''), created_at::text, (ip_address IS NOT NULL)::text, (user_agent IS NOT NULL)::text,
 (revoked_at IS NULL AND expires_at > NOW())::text FROM refresh_tokens ORDER BY created_at ASC, id ASC;""")
stations = q("SELECT id::text, organization_id::text, status::text FROM stations ORDER BY created_at ASC, id ASC;")
activity_90d = q("""SELECT action::text, entity::text, count(*)::text FROM activity_logs
 WHERE created_at > NOW() - INTERVAL '90 days' GROUP BY 1,2 ORDER BY 3::int DESC LIMIT 50;""")
activity_auth_90d = q("""SELECT action::text, count(*)::text FROM activity_logs
 WHERE created_at > NOW() - INTERVAL '90 days'
 AND action IN ('LOGIN','AUTH_FAIL','LOGOUT','REFRESH','REVOKE','REVOKE_ALL','RESET','UPDATE') GROUP BY 1 ORDER BY 1;""")
iam_audit_actions = q("""SELECT coalesce(meta_json->>'auditAction','(none)'), count(*)::text
 FROM activity_logs WHERE meta_json ? 'auditAction' GROUP BY 1 ORDER BY 1;""")
password_events = q("""SELECT created_at::text, coalesce(user_id::text,''), coalesce(organization_id::text,''),
 action::text, coalesce(meta_json->>'auditAction','') FROM activity_logs
 WHERE action IN ('UPDATE','RESET') OR meta_json->>'auditAction'='USER_PASSWORD_RESET_BY_ADMIN'
 ORDER BY created_at DESC LIMIT 200;""")
suspend_remove_events = q("""SELECT created_at::text, coalesce(user_id::text,''), coalesce(organization_id::text,''),
 coalesce(meta_json->>'auditAction','') FROM activity_logs
 WHERE meta_json->>'auditAction' IN ('USER_DEACTIVATED','USER_REMOVED_FROM_ORG','USER_REACTIVATED')
 ORDER BY created_at DESC LIMIT 200;""")
audit_by_org = q("SELECT coalesce(organization_id::text,'(none)'), count(*)::text FROM activity_logs GROUP BY 1;")
audit_90_org = q("""SELECT coalesce(organization_id::text,'(none)'), count(*)::text FROM activity_logs
 WHERE created_at > NOW() - INTERVAL '90 days' GROUP BY 1;""")

org_alias = {row[0]: f"ORG_{i:03d}" for i,row in enumerate(orgs,1)}
user_alias = {row[0]: f"USER_{i:03d}" for i,row in enumerate(users,1)}
mem_alias = {row[0]: f"MEMBERSHIP_{i:03d}" for i,row in enumerate(memberships,1)}
role_alias = {row[0]: f"ROLE_{i:03d}" for i,row in enumerate(roles,1)}
inv_alias = {row[0]: f"INVITE_{i:03d}" for i,row in enumerate(invites,1)}
station_by_org = defaultdict(set)
for sid, oid, st in stations: station_by_org[oid].add(sid)

active_by_user = defaultdict(list)
for m in memberships:
    if m[4]=='ACTIVE': active_by_user[m[1]].append(m)
multi_org_users = {uid: ms for uid,ms in active_by_user.items() if len(ms)>1}
users_no_active_mem = [u for u in users if u[0] not in active_by_user]

org_cov=[]
for oid, created, status in orgs:
    mems=[m for m in memberships if m[2]==oid]
    roles_o=[r for r in roles if r[1]==oid]
    invs=[i for i in invites if i[1]==oid]
    user_ids={m[1] for m in mems}
    active=[m for m in mems if m[4]=='ACTIVE']
    pending=[i for i in invs if i[2]=='PENDING']
    open_unexpired=[i for i in pending if (parse_ts(i[5]) or nowdt) > nowdt]
    expired_pending=[i for i in pending if (parse_ts(i[5]) or nowdt) <= nowdt]
    custom_roles=[r for r in roles_o if r[3]=='false']
    system_roles=[r for r in roles_o if r[3]=='true']
    active_tokens=[t for t in refresh if t[1] in user_ids and t[9]=='true']
    org_cov.append({
        'organizationAlias': org_alias[oid], 'organizationStatus': status,
        'usersLinkedViaMembership': len(user_ids), 'membershipsTotal': len(mems),
        'membershipsActive': len(active),
        'membershipsSuspended': sum(1 for m in mems if m[4]=='SUSPENDED'),
        'membershipsRemoved': sum(1 for m in mems if m[4]=='REMOVED'),
        'membershipsInvited': sum(1 for m in mems if m[4]=='INVITED'),
        'invitesOpenUnexpired': len(open_unexpired), 'invitesExpiredPending': len(expired_pending),
        'invitesExpiredStatus': sum(1 for i in invs if i[2]=='EXPIRED'), 'invitesTotal': len(invs),
        'adminsActiveOrgAdminRole': sum(1 for m in active if m[3]=='ORG_ADMIN'),
        'privilegedCustomRoles': sum(1 for r in custom_roles if is_privileged_role(r[11], r[5])),
        'customRoles': len(custom_roles), 'systemRoles': len(system_roles), 'rolesTotal': len(roles_o),
        'membershipsWithoutValidUser': sum(1 for m in mems if m[1] not in {u[0] for u in users}),
        'membershipsWithInvalidRoleRef': sum(1 for m in mems if m[5] and m[5] not in {r[0] for r in roles_o}),
        'activeMembershipsWithoutRoleLink': sum(1 for m in active if not m[5]),
        'rolesWithoutAssignments': sum(1 for r in roles_o if not any(m[5]==r[0] for m in mems)),
        'disabledRolesWithActiveAssignments': sum(1 for r in roles_o if r[4]=='false' and any(m[5]==r[0] and m[4]=='ACTIVE' for m in mems)),
        'membershipsWithPermissionSnapshot': sum(1 for m in mems if m[6]=='true'),
        'membershipsWithExplicitStationScope': sum(1 for m in mems if m[7] and m[7] not in ('','ALL')),
        'activeMembershipsAllStationsScope': sum(1 for m in active if (not m[7] or m[7]=='ALL') and m[8]=='false'),
        'activeRefreshTokensForMemberUsers': len(active_tokens),
        'activeRefreshFamiliesForMemberUsers': len({t[2] for t in active_tokens}),
        'multiOrgUsersTouchingOrg': sum(1 for uid in user_ids if uid in multi_org_users),
        'accessReviewsFound': 0,
        'auditEventsTotal': 0, 'auditEvents90d': 0,
    })
audit_map={r[0]: int(r[1]) for r in audit_by_org}
a90={r[0]: int(r[1]) for r in audit_90_org}
for row in org_cov:
    oid=next(k for k,v in org_alias.items() if v==row['organizationAlias'])
    row['auditEventsTotal']=audit_map.get(oid,0); row['auditEvents90d']=a90.get(oid,0)

drift_rows=[]
for m in memberships:
    mid, uid, oid, mrole, mstatus, rid, has_perm, sscope, has_sids, fa, c_at, u_at, perm_s, sids_s = m
    if not rid: continue
    role=next((r for r in roles if r[0]==rid), None)
    if not role:
        drift_rows.append({'membershipAlias':mem_alias[mid],'userAlias':user_alias.get(uid,'USER_UNKNOWN'),'organizationAlias':org_alias.get(oid,'ORG_UNKNOWN'),'roleAlias':'ROLE_MISSING','membershipStatus':mstatus,'classification':'UNKNOWN_SOURCE','permDiff':True,'stationScopeDiff':False,'stationIdsDiff':False,'fieldAgentDiff':False,'membershipRoleDiff':False,'roleActive':None,'roleUpdatedAt':None,'membershipUpdatedAt':u_at,'privilegedDrift':False}); continue
    r_perm=parse_json_maybe(role[11]); m_perm=parse_json_maybe(perm_s)
    def norm(p): return None if not p else json.dumps(p, sort_keys=True, separators=(',',':'))
    perm_diff=norm(r_perm)!=norm(m_perm); scope_diff=(role[6] or '')!=(sscope or '')
    def sidset(x): return None if not isinstance(x,list) else sorted(str(i) for i in x)
    sids_diff=sidset(parse_json_maybe(role[12]))!=sidset(parse_json_maybe(sids_s))
    fa_diff=(role[8]=='true')!=(fa=='true'); role_diff=role[5]!=mrole; role_active=role[4]=='true'
    rt=parse_ts(role[10]); mt=parse_ts(u_at)
    if isinstance(m_perm,dict) and any(k not in KNOWN for k in m_perm.keys()): cls='INVALID_PERMISSION_KEY'
    elif not role_active and mstatus=='ACTIVE': cls='DISABLED_ROLE_ACTIVE_ASSIGNMENT'
    elif not any([perm_diff,scope_diff,sids_diff,fa_diff,role_diff]): cls='IN_SYNC'
    elif rt and mt and rt>mt: cls='ROLE_CHANGED_NOT_PROPAGATED'
    elif mt and rt and mt>rt: cls='INTENTIONAL_OVERRIDE'
    else: cls='STALE_ROLE_SNAPSHOT'
    drift_rows.append({'membershipAlias':mem_alias[mid],'userAlias':user_alias.get(uid,'USER_UNKNOWN'),'organizationAlias':org_alias.get(oid,'ORG_UNKNOWN'),'roleAlias':role_alias[rid],'membershipStatus':mstatus,'classification':cls,'permDiff':perm_diff,'stationScopeDiff':scope_diff,'stationIdsDiff':sids_diff,'fieldAgentDiff':fa_diff,'membershipRoleDiff':role_diff,'roleActive':role_active,'roleUpdatedAt':role[10],'membershipUpdatedAt':u_at,'privilegedDrift':(is_privileged_role(role[11],role[5])!=is_privileged_role(perm_s,mrole)) or ((mrole=='ORG_ADMIN')!=(role[5]=='ORG_ADMIN'))})

invalid_station=[]
for m in memberships:
    sids=parse_json_maybe(m[13])
    if not isinstance(sids,list): continue
    bad=[s for s in sids if isinstance(s,str) and s not in station_by_org.get(m[2],set())]
    if bad: invalid_station.append({'membershipAlias':mem_alias[m[0]],'organizationAlias':org_alias[m[2]],'invalidStationIdCount':len(bad),'membershipStatus':m[4]})

multi_rows=[]
for uid, ms in multi_org_users.items():
    active_t=[t for t in refresh if t[1]==uid and t[9]=='true']
    multi_rows.append({'userAlias':user_alias[uid],'activeMembershipCount':len(ms),'organizationAliases':'|'.join(sorted(org_alias[m[2]] for m in ms)),'activeRefreshTokenCount':len(active_t),'activeFamilyCount':len({t[2] for t in active_t}),'classification':'REFRESH_ORG_DRIFT_RISK' if active_t else 'NOT_ENOUGH_DATA','refreshOrgDriftRisk':'yes','notes':'No organizationId on refresh_tokens'})

session_user_rows=[]
for u in users:
    uid=u[0]; active_t=[t for t in refresh if t[1]==uid and t[9]=='true']
    mems_u=[m for m in memberships if m[1]==uid]; active_m=[m for m in mems_u if m[4]=='ACTIVE']
    rem_m=[m for m in mems_u if m[4]=='REMOVED']; sus_m=[m for m in mems_u if m[4]=='SUSPENDED']
    if not active_t: cls='NOT_ENOUGH_DATA'
    elif len(active_m)>1: cls='REFRESH_ORG_DRIFT_RISK'
    elif u[1]=='SUSPENDED' and active_t: cls='SUSPENDED_MEMBERSHIP_SESSION'
    elif not active_m and rem_m and active_t: cls='REMOVED_MEMBERSHIP_SESSION'
    else: cls='USER_ONLY_SESSION'
    session_user_rows.append({'userAlias':user_alias[uid],'userStatus':u[1],'platformRole':u[2],'activeMembershipCount':len(active_m),'removedMembershipCount':len(rem_m),'suspendedMembershipCount':len(sus_m),'organizationAliases':'|'.join(sorted(org_alias[m[2]] for m in active_m)),'activeRefreshTokenCount':len(active_t),'activeFamilyCount':len({t[2] for t in active_t}),'classification':cls,'sessionOrgBound':'no','ambiguousOrgSelectionRisk':'yes' if len(active_m)>1 else ('possible' if len(active_m)==1 else 'n/a')})

cutoff90=nowdt-timedelta(days=90)
session_integrity={'refreshTokensTotal':len(refresh),'refreshTokensActive':sum(1 for t in refresh if t[9]=='true'),'refreshTokensRevoked':sum(1 for t in refresh if t[4]!=''),'refreshTokensExpiredUnrevoked':sum(1 for t in refresh if t[4]=='' and t[9]=='false'),'familiesActive':len({t[2] for t in refresh if t[9]=='true'}),'tokensWithReplacedBy':sum(1 for t in refresh if t[5]!=''),'familiesWithRotationEvidence':len({t[2] for t in refresh if t[5]!=''}),'reuseDetectionEventsObservableInDb':'not_directly_logged_as_rows','sessionMetadataHasIpFlagCount':sum(1 for t in refresh if t[7]=='true'),'sessionMetadataHasUaFlagCount':sum(1 for t in refresh if t[8]=='true'),'sessionsWithoutOrganizationBinding':len(refresh),'activeSessionsForUsersWithoutActiveMembership':0,'activeSessionsForSuspendedUsers':0,'activeSessionsOlderThan90d':0,'usersWithParallelActiveFamilies':0,'passwordEventsObserved':len(password_events),'suspendRemoveEventsObserved':len(suspend_remove_events),'activeSessionsSurvivingPasswordEventsTotal':0,'activeSessionsSurvivingSuspendRemoveEventsTotal':0,'distinctUsersWithPasswordEventsAndSurvivingSessions':0}
active_mem_users=set(active_by_user.keys()); suspended_users={u[0] for u in users if u[1]=='SUSPENDED'}; parallel=defaultdict(set)
for t in refresh:
    if t[9]!='true': continue
    uid=t[1]; parallel[uid].add(t[2])
    if uid not in active_mem_users: session_integrity['activeSessionsForUsersWithoutActiveMembership']+=1
    if uid in suspended_users: session_integrity['activeSessionsForSuspendedUsers']+=1
    ts=parse_ts(t[6])
    if ts and ts<cutoff90: session_integrity['activeSessionsOlderThan90d']+=1
session_integrity['usersWithParallelActiveFamilies']=sum(1 for u,f in parallel.items() if len(f)>1)

def survivors_for_events(events):
    total=0; rows=[]; users_hit=set()
    for ev in events:
        ts=parse_ts(ev[0]); uid=ev[1]
        if not ts or not uid: continue
        survivors=[t for t in refresh if t[1]==uid and t[9]=='true' and (parse_ts(t[6]) or nowdt)<=ts]
        total+=len(survivors)
        if survivors: users_hit.add(uid)
        rows.append({'eventAt':ev[0],'userAlias':user_alias.get(uid,'USER_UNKNOWN'),'organizationAlias':org_alias.get(ev[2],'') if len(ev)>2 else '','eventType':ev[-1],'activeSessionsCreatedAtOrBeforeEventStillActive':len(survivors)})
    return total, rows, len(users_hit)
pwd_total,pwd_rows,pwd_users=survivors_for_events(password_events)
sus_total,sus_rows,sus_users=survivors_for_events(suspend_remove_events)
session_integrity['activeSessionsSurvivingPasswordEventsTotal']=pwd_total
session_integrity['activeSessionsSurvivingSuspendRemoveEventsTotal']=sus_total
session_integrity['distinctUsersWithPasswordEventsAndSurvivingSessions']=pwd_users

admin_risk=[]
for row in org_cov:
    oa=row['organizationAlias']; oid=next(k for k,v in org_alias.items() if v==oa)
    active_admins=[m for m in memberships if m[2]==oid and m[4]=='ACTIVE' and m[3]=='ORG_ADMIN']
    priv_assigned=sum(1 for m in memberships if m[2]==oid and m[4]=='ACTIVE' and m[3]!='ORG_ADMIN' and is_privileged_role(m[12], m[3]))
    open_admin_invites=sum(1 for i in invites if i[1]==oid and i[2]=='PENDING' and i[3]=='ORG_ADMIN')
    admin_risk.append({'organizationAlias':oa,'activeOrgAdminCount':len(active_admins),'zeroAdminRisk':bool(len(active_admins)==0 and row['membershipsActive']>0),'singleAdminRisk':len(active_admins)==1,'noMembers':row['membershipsActive']==0,'privilegedNonEnumActiveMembers':priv_assigned,'openAdminInvites':open_admin_invites,'disabledRolesWithActiveAssignments':row['disabledRolesWithActiveAssignments'],'invalidStationMemberships':sum(1 for x in invalid_station if x['organizationAlias']==oa)})

u_no_mem_sessions=[{'userAlias':user_alias[u[0]],'userStatus':u[1],'platformRole':u[2],'activeRefreshTokens':len([t for t in refresh if t[1]==u[0] and t[9]=='true']),'activeFamilies':len({t[2] for t in refresh if t[1]==u[0] and t[9]=='true'})} for u in users_no_active_mem if any(t[1]==u[0] and t[9]=='true' for t in refresh)]

invite_rows=[]
for i in invites:
    iid,oid,status,mrole,rid,exp,c_at,u_at,acc_at,rev_at,acc_by,has_p,sscope,has_s,fa,email_len,email_lower=i
    accepted_no_mem=False
    if status=='ACCEPTED' and acc_by: accepted_no_mem=not any(m[1]==acc_by and m[2]==oid for m in memberships)
    invite_rows.append({'inviteAlias':inv_alias[iid],'organizationAlias':org_alias[oid],'status':status,'membershipRole':mrole,'hasOrganizationRoleId':bool(rid),'expiredByTime':bool(parse_ts(exp) and parse_ts(exp)<=nowdt),'acceptedWithoutMembership':accepted_no_mem,'emailLengthBucket':'short' if int(email_len)<10 else ('medium' if int(email_len)<30 else 'long'),'emailAlreadyLowercase':email_lower=='true','highRiskRole':mrole=='ORG_ADMIN','possibleResendRotation':status=='PENDING' and c_at!=u_at,'acceptedAfterExpiry':bool(status=='ACCEPTED' and parse_ts(acc_at) and parse_ts(exp) and parse_ts(acc_at)>parse_ts(exp))})

eff=[]
for m in memberships:
    if m[4]!='ACTIVE': continue
    m_perm=parse_json_maybe(m[12]) or {}
    sids=parse_json_maybe(m[13])
    if m[3]=='ORG_ADMIN' or not m[7] or m[7]=='ALL': station_mode='ALL_OR_BYPASS'
    elif isinstance(sids,list) and sids: station_mode='EXPLICIT_IDS'
    else: station_mode='SCOPE_STRING'
    eff.append({'membershipAlias':mem_alias[m[0]],'userAlias':user_alias[m[1]],'organizationAlias':org_alias[m[2]],'effectiveRole':m[3],'roleSource':'template' if m[5] else 'direct_or_legacy','roleAlias':role_alias.get(m[5],''),'hasPermissionSnapshot':m[6]=='true','permissionModuleCount':len(m_perm) if isinstance(m_perm,dict) else 0,'manageModuleCount':len([k for k,v in m_perm.items() if isinstance(v,dict) and v.get('manage') is True]) if isinstance(m_perm,dict) else 0,'privileged':m[3]=='ORG_ADMIN' or is_privileged_role(m[12],m[3]),'stationMode':station_mode,'fieldAgentAccess':m[9]=='true','driftClass':next((d['classification'] for d in drift_rows if d['membershipAlias']==mem_alias[m[0]]),'NO_ROLE_LINK')})

out={'capturedAt':nowdt.isoformat(),'mode':'read-only','writesPerformed':False,'windowDaysSessionsActivity':90,'totals':{'organizations':len(orgs),'users':len(users),'memberships':len(memberships),'roles':len(roles),'invites':len(invites),'refreshTokens':len(refresh),'stations':len(stations),'multiOrgActiveUsers':len(multi_org_users),'usersWithoutActiveMembership':len(users_no_active_mem)},'usersByStatus':dict(Counter(u[1] for u in users)),'usersByPlatformRole':dict(Counter(u[2] for u in users)),'organizationCoverage':org_cov,'roleMembershipDrift':drift_rows,'effectiveAccess':eff,'multiOrgSessions':multi_rows,'sessionUsers':session_user_rows,'sessionIntegrity':session_integrity,'passwordEventSessionSurvival':pwd_rows[:50],'suspendRemoveEventSessionSurvival':sus_rows[:50],'adminRisk':admin_risk,'usersNoActiveMembershipWithSessions':u_no_mem_sessions,'invalidStationScopes':invalid_station,'inviteIntegrity':invite_rows,'activity90dTop':[{'action':a,'entity':e,'count':int(c)} for a,e,c in activity_90d],'activityAuth90d':{a:int(c) for a,c in activity_auth_90d},'iamAuditActionsAllTime':{a:int(c) for a,c in iam_audit_actions}}
print(json.dumps(out))
