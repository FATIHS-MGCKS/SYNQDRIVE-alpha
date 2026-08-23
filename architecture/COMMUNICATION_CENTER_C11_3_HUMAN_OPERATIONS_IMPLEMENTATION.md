# Communication Center C11.3 — Human Operations Implementation

**Date:** 2026-08-23  
**Phase:** C11.3 (assignment, handoff, resolution UX)  
**Base:** `main` after merged PR #1193 (C11.2 reply composer + dispatch hardening)

## 1. Scope

C11.3 completes the human operator workflow in Communication Center:

- Ownership presentation (header + inbox)
- Claim / take over (`POST .../claim` or self-assign)
- Assignment / reassignment (`PATCH .../assignment`)
- Unassign (`PATCH .../assignment` with `assignedUserId: null`)
- Resolve / Reopen (existing C11.1 mutations)
- Permission-aware action resolver
- Member picker (active org members, lazy-loaded)
- Concurrency/conflict UX
- Composer / inbox / timeline convergence
- Responsive desktop/mobile UX, i18n, tests

**Out of scope:** new provider integrations, attachments, AI replies, notes/tags, bulk assignment, SLA, notification redesign, new conversation state model.

## 2. C11.1 mutation authority (unchanged)

| Action | Method | Path | Permission |
|--------|--------|------|------------|
| Claim | `POST` | `.../conversations/:id/claim` | `communication.write` |
| Assign / Unassign | `PATCH` | `.../conversations/:id/assignment` | `communication.write` (+ `communication.manage` for other users) |
| Resolve | `POST` | `.../conversations/:id/resolve` | `communication.write` |
| Reopen | `POST` | `.../conversations/:id/reopen` | `communication.write` |

Response: `{ conversation: CommunicationConversationDetailDto }`

Typed errors: `NOT_FOUND`, `FORBIDDEN`, `INVALID_TRANSITION`, `ALREADY_CLAIMED`, `ASSIGNEE_INVALID`, `STALE_STATE`

C11.3 adds **no** replacement mutation endpoints.

## 3. Ownership model

Canonical ownership = `assignedUserId` + `assignedUser` summary from read API.

| Visual state | Condition |
|--------------|-----------|
| Unassigned | no `assignedUser` |
| Assigned to me | `assignedUser.id === currentUserId` |
| Assigned to other | `assignedUser` present, different id |
| Resolved / Failed | terminal status (assignment may remain on RESOLVED) |
| Non-human | `AI_ACTIVE` / `WAITING_CUSTOMER` without human assignee |

Frontend never derives ownership from local optimistic state alone — mutations apply authoritative server response.

## 4. Assignee DTO

Already present in C7/C8 read API — no schema change required:

```typescript
assignedUser?: { id: string; displayName: string } | null
```

Mapped from org-scoped `User` join in `communication-read.mapper.ts`. No email/permissions exposed.

## 5. Member source

`GET /organizations/:orgId/users` via `api.users.listByOrg(orgId)` — same pattern as tasks/service center.

Loaded **lazily** when manager opens assignment picker (`useCommunicationOrgMembers`). Not fetched for write-only self-claim operators.

## 6. Eligibility

**Active members only:** `membershipStatus === 'ACTIVE'` and user `status === 'Active'`.

Inactive users excluded from picker; backend `assertActiveOrgMember` remains final validation.

**Station eligibility:** N/A for assignee target — backend validates operator station scope on mutation (`CommunicationWriteScopeService`) but does not restrict assignee by station membership. Documented as no canonical assignee-station filter.

## 7. Permission matrix

| Action | `communication.write` | `communication.manage` |
|--------|----------------------|------------------------|
| Claim unassigned `HUMAN_REQUIRED` | Yes | Yes (same atomic claim) |
| Self take-over (`AI_ACTIVE`/`WAITING_CUSTOMER` unassigned) | Self-assign | Self-assign |
| Assign to self | Yes | Yes |
| Assign to other | No | Yes |
| Unassign self | Yes | Yes |
| Unassign other | No | Yes |
| Resolve / Reopen | Yes | Yes |

Resolver: `resolveCommunicationHumanActions({ conversation, canWrite, canManage, currentUserId })`

## 8. Claim UX

Unassigned `HUMAN_REQUIRED` → prominent **Take over** button (`CommunicationAssigneeControl`).

Calls `POST .../claim`. No member picker for write-only operators.

## 9. Assignment UX

Managers: ownership dropdown → Assign / Reassign → searchable member dialog (`CommunicationMemberPicker`).

Mutation on deliberate selection only (CommandItem `onSelect`). No confirmation modal.

## 10. Handoff / reassignment

Handoff = canonical `PATCH assignment` from assignee A → B. No new backend state or event type. Timeline receives existing `HUMAN_ASSIGNED` event from C11.1.

## 11. Unassign

Permitted per C11.1 matrix. Menu item **Unassign** → `PATCH` with `assignedUserId: null`. Target status `HUMAN_REQUIRED`.

## 12. Resolve

Secondary header action **Resolve** / DE **Abschließen**. No confirmation modal. Composer hidden on `RESOLVED` via existing `resolveCommunicationComposerState`.

## 13. Reopen

**Reopen** for `RESOLVED` / `FAILED`. Target status determined by backend `resolveReopenTargetStatus` — frontend does not compute.

## 14. State / action matrix

See `communication-human-actions.test.ts` for matrix coverage.

## 15. Composer convergence

`resolveCommunicationComposerState` now receives `currentUserId` from `CommunicationCenterShell` (`getStoredUser()?.id`).

`OWNED_BY_OTHER` blocks composer for non-assignee write users. Updates after assign/claim/unassign via `applyConversationUpdate` + inbox refresh.

## 16. Inbox convergence

`CommunicationConversationRow` shows subtle assignee avatar + "Assigned to you" / assignee name.

Inbox refresh via existing `inboxRefreshNonce` after mutations.

## 17. Timeline convergence

`useCommunicationConversationActions` refreshes timeline after claim/assign/unassign/resolve/reopen. No fabricated timeline entries.

## 18. Concurrency / conflicts

| Error | UX |
|-------|-----|
| `ALREADY_CLAIMED` | Inline alert, detail refresh via `onConflictRefresh` |
| `STALE_STATE` | Inline alert + refresh |
| `INVALID_TRANSITION` | Inline alert |
| `FORBIDDEN` | Inline alert |

No blind retry. No stale Take over button after conflict refresh.

## 19. Org / conversation race safety

Existing `communicationConversationSignature(orgId, conversationId)` guards in `useCommunicationConversationActions` and `useCommunicationReply`.

Org switch resets member cache in `useCommunicationOrgMembers`.

## 20. Mobile UX

Ownership control + lifecycle actions in workspace header. Member picker uses `Dialog` (usable on mobile, keyboard-friendly).

## 21. Accessibility

Ownership control: labeled button, assignee name in label, keyboard-openable dropdown/dialog, `role="alert"` on errors.

Member picker: labeled search, keyboard navigation via Command primitives.

## 22. i18n

Keys under `communication.ownership.*`, extended `communication.actions.error*`, `communication.inbox.assignedToYou`.

EN: Take over, Assign, Reassign, Unassign, Resolve, Reopen  
DE: Übernehmen, Zuweisen, Neu zuweisen, Zuweisung aufheben, Abschließen, Wieder öffnen

## 23. Performance

- No N+1 user fetches in inbox (assignee summary in list/detail DTO)
- Member directory loaded on demand per org
- Org switch invalidates member cache

## 24. Security

- Write-only users do not load member directory unless `communication.manage`
- Assignee summary exposes id + displayName only
- Backend RBAC/tenant/station scope unchanged

## 25. Tests

| File | Coverage |
|------|----------|
| `communication-human-actions.test.ts` | Action resolver matrix |
| `communication-actions.test.ts` | Lifecycle actions (resolve/reopen/markRead) |
| `CommunicationWorkspacePane.actions.test.tsx` | Header ownership + error messages |
| C11.1/C11.2 existing tests | Regression (unchanged backend) |

## 26. Known limitations

- Member picker requires `users.read` (same as tasks) — managers without it cannot load directory
- No station-filtered assignee list (backend has no assignee-station rule)
- Self take-over from `AI_ACTIVE` uses assign (keeps status unless `HUMAN_REQUIRED` transition)
- No success toasts (inline ownership update is primary feedback; matches C11.1/C11.2 pattern)

## 27. Next-phase readiness

**READY FOR NEXT COMMUNICATION WRITE PHASE** — human operations UX complete on C11.1 authority; attachments/templates/AI reply remain future phases.
