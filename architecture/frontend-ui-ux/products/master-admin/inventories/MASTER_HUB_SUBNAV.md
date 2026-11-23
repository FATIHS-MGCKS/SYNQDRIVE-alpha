# Master Admin — Hub & sub-navigation contracts

**Code baseline SHA:** `413175e8ca72355764a3d47936ad7eff78d415aa`  
**Mechanism:** Top-level `?view=` from `frontend/src/master/navigation/master-nav.config.ts`; hub interiors use dedicated query params.

## Security & access (`view=security-access`)

| Subnav id | Label (DE, code) | URL param | Source |
|-----------|------------------|-----------|--------|
| overview | Übersicht | `securityAccess=overview` | `frontend/src/master/security-access/security-access.utils.ts` |
| users | Benutzer | `securityAccess=users` | same |
| master-admins | Plattform-Admins | `securityAccess=master-admins` | same |
| roles | Rollen | `securityAccess=roles` | same |
| audit | Audit | `securityAccess=audit` | same |
| security-events | Sicherheitsereignisse | `securityAccess=security-events` | same |
| own-security | Eigene Sicherheit | `securityAccess=own-security` + `ownSecurityTab` | `frontend/src/master/security-access/security-access-url.ts` |

**Hub:** `frontend/src/master/security-access/SecurityAccessHub.tsx`

## Platform operations (`view=platform-ops`)

| Subnav id | Label | Source |
|-----------|-------|--------|
| overview … diagnostics (7) | see constants | `frontend/src/master/platform-ops/platform-ops.utils.ts` |
| processing inner tabs | `PROCESSING_TABS` | `frontend/src/master/platform-ops/tabs/PlatformOpsProcessingTab.tsx` |

**Hub:** `frontend/src/master/platform-ops/PlatformOpsHub.tsx`  
**URL:** `frontend/src/master/platform-ops/platform-ops-url.ts` (**PARTIAL**)

## Platform integrations (`view=platform-integrations`)

Sections: overview, integrations, webhooks, settings, changelog — `frontend/src/master/platform-integrations/platform-integrations.utils.ts`  
**Hub:** `frontend/src/master/platform-integrations/PlatformIntegrationsHub.tsx`

## Billing (`view=billing`)

`frontend/src/master/components/billing/master-billing-navigation.ts` — 6 top sections + nested reconciliation / audit / pricing tabs (**CONFIRMED** constants).

## Organization detail

8 tabs — `frontend/src/master/organizations/types.ts` (`ORG_DETAIL_TABS`); URL `orgTab` via `frontend/src/master/organizations/org.utils.ts`; tab bar `MasterPageTabs` with horizontal scroll + active-tab visibility (**CONFIRMED** — UX-005 2026-11-23)

## Voice assistant admin

`frontend/src/master/components/voice-control-plane/voice-control-plane-navigation.ts` (**PARTIAL** per-section UI)

## Connected vehicles / High Mobility

`cvSection` / `hmTab` — **PARTIAL** (not fully enumerated in this closeout)