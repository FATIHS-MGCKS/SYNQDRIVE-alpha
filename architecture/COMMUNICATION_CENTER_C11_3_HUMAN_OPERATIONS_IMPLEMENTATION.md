# Communication Center C11.3 — Human Operations Implementation

**Date:** 2026-08-23  
**Phase:** C11.3 (assignment, handoff, resolution UX) + final tenant-race / human-takeover hardening
**Base:** `main` after merged PR #1193 (C11.2 reply composer + dispatch hardening)

## 1. Scope

C11.3 completes the human operator workflow in Communication Center:

- Ownership presentation (header + inbox)
- Claim / take over (`POST .../claim`)
- Assignment / reassignment (`PATCH .../assignment`)
- Unassign (`PATCH .../assignment` with `assignedUserId: null`)
- Resolve / Reopen (existing C11.1 mutations)
- Permission-aware action resolver
- Member picker (active org members, lazy-loaded)
- Concurrency/conflict UX
- Composer / inbox / timeline convergence
- Responsive desktop/mobile UX, i18n, tests

**Out of scope:** new provider integrations, attachments, AI replies, notes/tags, bulk assignment, SLA, notification redesign, new conversation state model.

## 2. Mutation authority

| Action | Method | Path | Permission |
|--------|--------|------|------------|
| Claim / human takeover | `POST` | `.../conversations/:id/claim` | `communication.write` |
| Assign / Unassign | `PATCH` | `.../conversations/:id/assignment` | `communication.write` (+ `communication.manage` for other users) |
| Resolve | `POST` | `.../conversations/:id/resolve` | `communication.write` |
| Reopen | `POST` | `.../conversations/:id/reopen` | `communication.write` |

Response: `{ conversation: CommunicationConversationDetailDto }`

Typed errors: `NOT_FOUND`, `FORBIDDEN`, `INVALID_TRANSITION`, `ALREADY_CLAIMED`, `ASSIGNEE_INVALID`, `STALE_STATE`

C11.3 extends **claim** semantics for human takeover (no new public endpoint).

## 3. Human takeover backend authority

Shared service: `CommunicationHumanTakeoverService.performHumanTakeover`.

Invoked from:

1. `CommunicationWriteService.claimConversation` when status is `AI_ACTIVE` or `WAITING_CUSTOMER` and unassigned
2. `CommunicationReplyService.prepareOwnership` (C11.2 reply-triggered takeover — same helper)

**Atomic transition:**

- `assignedUserId = actor`
- `status = HUMAN_ACTIVE`
- Exactly one `HUMAN_ASSIGNED` event via `appendEventIdempotently`
- Audit action `communication.takeover` when changed
- Conditional `updateMany` on `assignedUserId=null`, `status=source`, `updatedAt` — loser gets `ALREADY_CLAIMED`

**State machine additions (C11.3 hardening):**

- `AI_ACTIVE → HUMAN_ACTIVE`
- `WAITING_CUSTOMER → HUMAN_ACTIVE`
- `HUMAN_ACTIVE → HUMAN_REQUIRED` (unassign invariant)

Generic `PATCH assignment` does **not** perform human takeover — it preserves status when not `HUMAN_REQUIRED`.

## 4. Ownership model

Canonical ownership = `assignedUserId` + `assignedUser` summary from read API.

| Visual state | Condition |
|--------------|-----------|
| Unassigned | no `assignedUser` |
| Assigned to me | `assignedUser.id === currentUserId` |
| Assigned to other | `assignedUser` present, different id |
| Resolved / Failed | terminal status (assignment may remain on RESOLVED) |
| Non-human | `AI_ACTIVE` / `WAITING_CUSTOMER` without human assignee |

Frontend never derives ownership from local optimistic state alone — mutations apply authoritative server response.

## 5. Assignee DTO

Already present in C7/C8 read API — no schema change required:

```typescript
assignedUser?: { id: string; displayName: string } | null
```

Mapped from org-scoped `User` join in `communication-read.mapper.ts`. No email/permissions exposed.

## 6. Member source

`GET /organizations/:orgId/users` via `api.users.listByOrg(orgId)` — requires `users-roles.read`.

Loaded **lazily** when manager opens assignment picker (`useCommunicationOrgMembers`). Not fetched for write-only self-claim operators.

### Member directory org/request race authority

`useCommunicationOrgMembers` tracks:

- `activeOrgRef` — current org id
- `requestGenerationRef` — incremented on every org change

On org change: clear members, clear `loadedOrgRef`, invalidate generation.

After response, apply only when:

```typescript
requestGenerationRef.current === requestGeneration
&& activeOrgRef.current === requestOrgId
```

Do not rely on `inflightOrgRef` alone. Handles A→B stale response, A→B→A generation races, rapid picker opens.

### Member display fallback

`resolveOrgMemberDisplayName` order:

1. `displayName`
2. `name`
3. `firstName + lastName`
4. `"Unknown user"` (i18n key in UI)

Never expose email or raw UUID as normal picker label.

### Active member normalization

`isActiveOrgMember` compares `status` and `membershipStatus` case-insensitively against `ACTIVE` / `Active`.

## 7. Member directory permission behavior

`communication.manage` does **not** imply `users-roles.read`.

`CommunicationCenterShell`:

```typescript
membersDirectoryAvailable = !canManage || canReadUsers
```

When manager lacks `users-roles.read`:

- `canOpenMemberPicker = false` (resolver)
- Assign/Reassign menu hidden — no repeated 403 calls
- If load attempted and 403 returned: `loadError = 'permission_denied'` with safe i18n message (no raw API error)

Does not broaden `users.read` permission in this phase.

## 8. Permission matrix

| Action | `communication.write` | `communication.manage` |
|--------|----------------------|------------------------|
| Claim unassigned `HUMAN_REQUIRED` | Yes | Yes (same atomic claim) |
| Self take-over (`AI_ACTIVE`/`WAITING_CUSTOMER` unassigned) | Yes (`POST claim`) | Yes |
| Assign to self | Yes | Yes |
| Assign to other | No | Yes (+ `users-roles.read` for picker) |
| Unassign self | Yes | Yes |
| Unassign other | No | Yes |
| Resolve / Reopen | Yes | Yes |

Resolver: `resolveCommunicationHumanActions({ conversation, canWrite, canManage, currentUserId, membersDirectoryAvailable })`

## 9. Claim / take over UX

Unassigned `HUMAN_REQUIRED` or unassigned `AI_ACTIVE` / `WAITING_CUSTOMER` → prominent **Take over** button.

Frontend `takeOverSelf()` → `communicationClient.claimConversation()` (not `assign`).

Result: `HUMAN_ACTIVE` + `assignedUserId = current user`. No provider call, no reply send, no hidden composer send.

## 10. Assignment UX

Managers with directory access: ownership dropdown → Assign / Reassign → searchable member dialog (`CommunicationMemberPicker`).

Mutation on deliberate selection only (CommandItem `onSelect`). No confirmation modal.

## 11. Handoff / reassignment

Handoff = canonical `PATCH assignment` from assignee A → B. Timeline receives existing `HUMAN_ASSIGNED` event from C11.1.

## 12. Unassign

Permitted per C11.1 matrix. Menu item **Unassign** → `PATCH` with `assignedUserId: null`. Target status `HUMAN_REQUIRED`.

## 13. Resolve

Secondary header action **Resolve** / DE **Abschließen**. No confirmation modal. Composer hidden on `RESOLVED` via existing `resolveCommunicationComposerState`.

## 14. Reopen

**Reopen** for `RESOLVED` and `FAILED` per C11.1 `resolveReopenTargetStatus` — frontend derives from `resolveCommunicationConversationActions`, not duplicated assumptions.

`FAILED → HUMAN_REQUIRED` on reopen is allowed. Frontend shows Reopen for both terminal statuses when lifecycle resolver includes it.

## 15. Composer convergence

`resolveCommunicationComposerState` receives `currentUserId` from `CommunicationCenterShell` (single source: `getStoredUser()?.id`, passed to children).

After explicit takeover: ownership = Assigned to you, status = `HUMAN_ACTIVE`, composer enabled, timeline/inbox refresh — no page reload, no message send required.

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

Parallel takeover: exactly one winner (`HUMAN_ACTIVE` + winner assignee). Loser sees `ALREADY_CLAIMED`.

## 19. Org / conversation race safety

- `communicationConversationSignature(orgId, conversationId)` in `useCommunicationConversationActions` and `useCommunicationReply`
- Member directory: `activeOrgRef` + `requestGenerationRef` (see §6)

## 20. Current user source

`CommunicationCenterShell` reads `getStoredUser()?.id` once and passes `currentUserId` to inbox/workspace panes. Established repo convention; reactive auth changes without reload are accepted limitation (documented).

## 21. Mobile UX

Ownership control + lifecycle actions in workspace header. Member picker uses `Dialog` (usable on mobile, keyboard-friendly).

## 22. Accessibility

Ownership control: labeled button, assignee name in label, keyboard-openable dropdown/dialog, `role="alert"` on errors.

Member picker: labeled search, keyboard navigation via Command primitives.

## 23. i18n

Keys under `communication.ownership.*`, extended `communication.actions.error*`, `communication.inbox.assignedToYou`, `communication.ownership.membersPermissionDenied`.

EN: Take over, Assign, Reassign, Unassign, Resolve, Reopen  
DE: Übernehmen, Zuweisen, Neu zuweisen, Zuweisung aufheben, Abschließen, Wieder öffnen

## 24. Performance

- No N+1 user fetches in inbox (assignee summary in list/detail DTO)
- Member directory loaded on demand per org
- Org switch invalidates member cache and request generation

## 25. Security

- Write-only users do not load member directory unless `communication.manage` + `users-roles.read`
- Assignee summary exposes id + displayName only
- Backend RBAC/tenant/station scope unchanged
- Stale cross-tenant member responses rejected at hook layer

## 26. Tests

| File | Coverage |
|------|----------|
| `communication-human-actions.test.ts` | Action resolver matrix, directory permission, takeover eligibility |
| `communication-actions.test.ts` | Lifecycle actions (resolve/reopen/markRead) |
| `useCommunicationOrgMembers.test.ts` | Org A stale after B, A→B→A generation, 403 |
| `org-member-display.test.ts` | Safe name fallback, active status normalization |
| `useCommunicationConversationActions.test.ts` | Takeover via claim, conflict convergence |
| `communication-composer-capability.test.ts` | Post-takeover composer enabled |
| `CommunicationMemberPicker.test.tsx` | Permission message, safe names |
| `CommunicationWorkspacePane.actions.test.tsx` | Header ownership + AI_ACTIVE takeover |
| `communication-write.postgres.integration.spec.ts` | AI_ACTIVE/WAITING_CUSTOMER takeover, parallel race, events |
| C11.1/C11.2 existing tests | Regression |

## 27. Known limitations

- Member picker requires `users-roles.read` in addition to `communication.manage`
- No station-filtered assignee list (backend has no assignee-station rule)
- No success toasts (inline ownership update is primary feedback; matches C11.1/C11.2 pattern)
- `getStoredUser()` is not reactive to auth changes without page reload

## 28. Next-phase readiness

**READY FOR FINAL REVIEW** — human operations UX complete with canonical takeover and tenant-safe member loading.
