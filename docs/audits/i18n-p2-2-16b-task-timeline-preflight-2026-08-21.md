# P2.2.16B — Task Timeline Utilities — Read-Only Pre-Flight / Implementation Contract

**Date:** 2026-08-21  
**Mode:** Strict read-only audit  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Authoritative baseline:** `1370a3841e15a506be57cd45a5cf7f2fdf2841a9`

---

## 0. Provenance

| Check | Independent result |
|-------|-------------------|
| PR #1113 merged | **YES** — `state: MERGED`, `mergedAt: 2026-08-21T15:37:24Z` |
| Merge commit SHA | **`1370a3841e15a506be57cd45a5cf7f2fdf2841a9`** ✓ |
| Merge type | **Squash merge** (single parent `467f47a5`; PR head `efad1874` is not a git ancestor) |
| Program content tip | **`1370a3841e15a506be57cd45a5cf7f2fdf2841a9`** |
| `POST_P216A_CONTENT_HEAD` | **`1370a3841e15a506be57cd45a5cf7f2fdf2841a9`** |
| Branch | `cursor/p227b-voice-telephony-test-center-preflight-3c10` @ same SHA |
| P2.2.7B–P2.2.15 ancestry | Present in history leading to `467f47a5` |
| P2.2.16A content at tip | **Verified** — `service-task-presentation-i18n.ts` present |
| Stale branch / audit branch used | **NO** — audited `origin/cursor/p227b-voice-telephony-test-center-preflight-3c10` |

**Topology verdict:** **PASS** — not D.

---

## 1. Current i18n baseline (recomputed)

| Metric | Independent value |
|--------|------------------:|
| Global scanner findings | **1755** |
| Rental | **488** |
| Master | **1049** |
| Operator | **158** |
| SHARED | **35** |
| SHELL | **25** |
| Tasks module (Rental) | **13** |
| Global enforce-clean remaining | **2** (VehiclePickerStep) |
| Canonical EN keys | **7733** |
| Canonical DE keys | **7733** |
| Parity | **100%** |
| Shim total | **29** (prod **18**, test **11**) |

---

## 2. P216A freeze verification

| Check | Result |
|-------|--------|
| `service-task-semantics.ts` — no `TASK_*_LABEL_DE` | **PASS** |
| `service-task-presentation-i18n.ts` present | **PASS** |
| P216A enforce-clean (17 paths) | **0** |
| P215 enforce-clean (6 paths) | **0** |
| EN→DE task-type leak regression | **NONE detected** |

P216A files **not modified** during this pre-flight.

---

## 3. Primary target — `lib/tasks/taskTimeline.utils.ts`

285 lines. Exports:

| Export | Classification |
|--------|----------------|
| `isTechnicalUserLabel` | **C** — technical UUID detector |
| `formatTaskTimelineActor` | **A/D** — user-facing actor labels (`SynqDrive`, `Automatisch`, `Unbekannter Nutzer`) |
| `humanizeResolutionReason` | **A/D** — presentation prose + English→German substring rewrites |
| `formatTaskTimelineSentence` | **A** — primary event sentence builder (German prose) |
| `buildTaskTimelineItems` | **A/D** — presentation assembly + sort (machine sort preserved) |
| `buildTaskCommentAuthorLabel` | **A** — author fallback labels |

Internal helpers (`formatDateTimeDefault`, `resolveReasonLabel`, `withActorPrefix`, `describeTimingChange`, `resolveTimelineTone`) mix **A** (presentation) and **B/C** (tone mapping, JSON parse).

---

## 4. Exact hidden-debt count

### Scanner-visible (`taskTimeline.utils.ts`)

| Category | Count |
|----------|------:|
| Direct TEXT/PLACEHOLDER findings | **0** |
| FORMAT_LOCALE (`de-DE` default) | **1** (grouped finding shared with `formatVehicleDisplay.ts`, `money.ts`; severity `debt`, phase P2.3) |

### Manually confirmed presentation literals

| Class | Exact count |
|-------|------------:|
| `RESOLUTION_CODE_LABELS` map entries (German) | **7** |
| Unique static German prose strings | **19** |
| German template literals (actor/checklist interpolation) | **8** |
| Actor/system fallback labels | **3** (`SynqDrive`, `Automatisch`, `Unbekannter Nutzer`) |
| Default locale literal | **1** (`de-DE` in `toLocaleString`) |
| English input rewrite rules in `humanizeResolutionReason` | **2** (`Booking → Buchung`, `Invoice → Rechnung`) |

**Hidden presentation debt (scanner-blind prose/maps): ~38 distinct user-facing literals/templates**

Not approximated — counted from source via literal/template inventory.

### Mixed-language behavior under EN UI

**Confirmed leak count (timeline path): ALL timeline event titles/descriptions render German** because:

1. `formatTaskTimelineSentence` returns hardcoded German sentences.
2. `buildTaskTimelineItems` defaults datetime to **`de-DE`** when `options.locale` omitted.
3. `taskDetailView.utils.ts` calls `buildTaskTimelineItems` **without passing `locale`**.

Existing tests **assert German output** (e.g. `'Von Fatih Sero als erledigt markiert'`) — encoding the leak as expected behavior.

---

## 5. Consumer graph

### Direct production imports of `taskTimeline.utils.ts`

| Consumer | Import(s) | Renders? | Locale available? | Class |
|----------|-----------|----------|---------------------|-------|
| `lib/tasks/taskDetailView.utils.ts` | `buildTaskTimelineItems`, `buildTaskCommentAuthorLabel` | **Yes** (view model) | **NO** — options lack `locale`; datetime via `formatTaskDateTime` only | **B** |
| `lib/tasks/taskDetailActions.utils.ts` | `humanizeResolutionReason` | **Yes** (completion summary) | **NO** | **B** |
| `lib/tasks/index.ts` | re-export | — | — | **C** |

### Indirect production consumers (via `buildTaskDetailViewModel`)

| Consumer | Domain | Locale in host | Passes locale to timeline? | Test coverage |
|----------|--------|----------------|---------------------------|---------------|
| `rental/components/tasks/GlobalTaskDetailPanel.tsx` | Rental Task Detail | `useLanguage().locale` ✓ | **NO** | Contract test only |
| `rental/components/tasks/VehicleTaskDetailDrawer.tsx` | Rental vehicle tasks | Partial | **NO** | None for timeline |
| `operator/tasks/OperatorTaskDetail.tsx` | Operator | **NO** | **NO** | None for timeline |
| `lib/tasks/components/TaskDetailBody.tsx` | Shared shell | Via model | **NO** | Render tests (DE chrome) |
| `lib/tasks/components/TaskDetailNotesActivitySection.tsx` | Shared activity tab | Via model | **NO** | Partial |

**Exact production consumer count touching timeline output: 5 hosts + 2 lib wiring files = 7**

### Parallel / unused utility

| File | Production consumers | Class |
|------|---------------------|-------|
| `rental/lib/task-timeline-display.utils.ts` | **0** (tests only) | **E** — deprecated/unused duplicate German maps |

Do **not** expand P216B into this file unless explicitly adding dead-code cleanup; not on current leak path.

---

## 6. P24 governance gap

**P24 enforce-clean scope:**

- Exact: `TasksView.tsx`, `SettingsView.tsx`
- Prefixes: `rental/components/tasks/`, `rental/lib/task-*.ts`, etc.

**`lib/tasks/taskTimeline.utils.ts` is SHARED surface — excluded from P24.**

P24 rental Tasks UI can remain **0** while Task Detail timeline (SHARED lib) leaks German under EN.

**Correct fix:** new **`P216B_ENFORCE_CLEAN_EXACT`** boundary — do **not** rewrite P24.

---

## 7. Timeline machine semantics

Machine values preserved today and must remain unchanged:

| Value | Used for | Presentation leak? |
|-------|----------|-------------------|
| `event.type` | switch routing | No (code unchanged) |
| `event.newValue` / `oldValue` | status/checklist/timing JSON | Values stay raw; labels added separately |
| `event.metadata.*` | resolution codes, checklist titles, previews | User data (titles, previews) must not be translated |
| `event.createdAt` | sort + time display | Timestamp preserved; format may localize |
| `event.actorUserId` | actor resolution | ID unchanged |
| Actor display names | interpolated | User data — never translate |

**Category E risk: LOW** if implementation only replaces string literals with `t(locale, key, params)` and threads locale — no change to event ordering, persistence, or API payloads.

---

## 8. Event taxonomy

Handled in `formatTaskTimelineSentence` (15 distinct `case` branches):

| Machine event type | Current presentation ownership | EN today | DE today | Canonical key exists? | Est. new key |
|--------------------|-------------------------------|----------|----------|----------------------|-------------|
| `CREATED` | German sentence | German | German | **No** | Yes |
| `ASSIGNED` | German sentence | German | German | **No** | Yes |
| `STATUS_CHANGED` | German + `taskStatusLabelDe` | German | German | Partial (`tasks.filter.status.*`) | Yes (templates) |
| `CHECKLIST_ITEM_ADDED` | German + `{title}` | German | German | **No** | Yes |
| `CHECKLIST_ITEM_UPDATED` | German + `{title}` | German | German | **No** | Yes |
| `COMMENT_ADDED` | German + preview | German | German | Partial (`tasks.detail.comment*`) | Yes |
| `ATTACHMENT_ADDED` | German | German | German | **No** | Yes |
| `AUTO_RESOLVED` | German + resolution map | German | German | Partial (`tasks.completionMode.autoResolved`) | Yes |
| `SUPERSEDED` | German + resolution map | German | German | Partial (`tasks.completionMode.superseded`) | Yes |
| `CHECKLIST_COMPLETION_OVERRIDDEN` | German + reason | German | German | **No** | Yes |
| `TIMING_CHANGED` | German + timing parts | German | German | **No** | Yes |
| `LINKS_UPDATED` | German | German | German | **No** | Yes |
| `UPDATED` | German | German | German | **No** | Yes |
| `default` | `event.label` or type slug | Mixed | Mixed | **No** | Fallback key |

**Resolution codes (7):** `INVOICE_PAID`, `BOOKING_CANCELLED`, `BOOKING_PHASE_SUPERSEDED`, `INVOICE_TASK_SUPERSEDED`, `DOCUMENT_TASK_SUPERSEDED`, `CLEANING_TASK_SUPERSEDED`, `DOCUMENT_PHASE_SUPERSEDED`

**Event taxonomy count: 15 event branches + 7 resolution codes + 3 actor labels + 2 timing fragments**

---

## 9. Template / interpolation safety

Templates requiring `TranslationKey + params`:

| Pattern | Dynamic params | Must not translate |
|---------|----------------|------------------|
| `Von ${actor} …` | `actor` (display name) | Actor names |
| `hat „${title}" erledigt` | checklist title | User-entered title |
| `Automatisch aufgelöst: ${reason}` | reason label | Raw metadata reason if user text |
| `Neuer Status: ${statusLabel}` | status presentation | Status machine code in `newValue` |
| Comment preview in `description` | `bodyPreview` | User comment text |

**Anti-pattern today:** prebuilt German prose in utility + `humanizeResolutionReason` rewriting English API reasons to German fragments.

---

## 10. Relative time / date formatting

| Issue | Location | Risk |
|-------|----------|------|
| Default `locale ?? 'de-DE'` | `formatDateTimeDefault` | **EN UI shows DE-formatted timestamps** |
| No relative labels (`today`, `ago`) | — | N/A in this file |
| `options.formatDateTime` hook | Used by `taskDetailView` | Good extension point — pass locale-aware formatter |

Reuse candidates: existing date formatters in `task-detail.utils` / product locale helpers — align with `formatTaskDateTime` locale threading (P216C may own broader detail date policy; P216B must at minimum stop hardcoding `de-DE` default).

---

## 11. `taskSourceLabel` analysis

| Item | Finding |
|------|---------|
| Definition | `service-task-semantics.ts` → `task-operator.utils.ts` `SOURCE_LABEL_DE` |
| Timeline utility | **Not owned by `taskTimeline.utils.ts`** |
| Consumers | Service center cards (P216A boundary) |
| EN under EN UI | **Still German** |
| P216B scope? | **NO** — defer unless explicitly expanded; P216A audit noted as residual |
| P216C scope? | Possible, but source badges are not timeline events |

---

## 12. Cross-consumer mixed-language examples

| Surface | EN locale UI | Inner timeline output | Severity |
|---------|--------------|----------------------|----------|
| `GlobalTaskDetailPanel` → Activity tab | EN chrome (`t(...)`) | **German event titles** | **Confirmed leak** |
| `OperatorTaskDetail` | Mixed DE errors | **German timeline** | Leak |
| `TaskDetailNotesActivitySection` | `"Notizen und Aktivität"` (DE hardcoded) | German timeline items | P216C chrome + P216B timeline |
| `STATUS_CHANGED` description | — | `Neuer Status: ${taskStatusLabelDe(...)}` | German status label under EN |

---

## 13. Canonical key reuse

**Search result:** `tasks.timeline.*` — **0 existing keys**

### Reuse candidates

| Concept | Reuse key | Class |
|---------|-----------|-------|
| Status labels in descriptions | `tasks.filter.status.*` | **A** |
| Completion mode labels | `tasks.completionMode.autoResolved` / `.superseded` | **B** |
| Unknown user | None exact — consider `common.*` pattern | **C** |
| Actor "Automatic" / system | None exact | **C** |

### Estimates

| Metric | Estimate |
|--------|----------|
| Safe reuse | **~8–12** keys |
| Genuinely new `tasks.timeline.*` | **~35–45** keys |
| Duplicate risk | **Low** if namespace is `tasks.timeline.event.*`, `tasks.timeline.resolution.*`, `tasks.timeline.actor.*` |
| Orphan risk | **Low** if adapter maps all event branches |

---

## 14. Proposed architecture

**Recommended: Option B**

Create `lib/tasks/task-timeline-presentation-i18n.ts`:

- `ttpi(locale, key, params)` helper (mirror P216A `stpi` pattern)
- `formatTaskTimelineActorLocalized(locale, event)`
- `formatTaskTimelineSentenceLocalized(locale, event)`
- `buildTaskTimelineItemsLocalized(locale, events, options)`
- `buildTaskCommentAuthorLabelLocalized(locale, ...)`
- `humanizeResolutionReasonLocalized(locale, reason)` (or move to presentation adapter)

Keep `taskTimeline.utils.ts` as **machine-only** (sort order, tone mapping, technical UUID check, JSON parse for timing) OR thin re-export wrapper during migration.

**No React hooks. No hidden global locale. Explicit `locale` parameter.**

---

## 15. P216B exact boundary (proposed)

### `P216B_ENFORCE_CLEAN_EXACT` (initial)

| Path | Reason |
|------|--------|
| `lib/tasks/taskTimeline.utils.ts` | Primary debt |
| `lib/tasks/task-timeline-presentation-i18n.ts` | New adapter (if created) |
| `lib/tasks/taskDetailView.utils.ts` | Timeline + comment author wiring only |
| `lib/tasks/taskDetailActions.utils.ts` | `humanizeResolutionReason` consumer |

**Exclude from enforce-clean (P216C):**

- `lib/tasks/components/TaskDetail*.tsx`
- `TaskDetailNotesActivitySection.tsx` UI chrome
- Header/status labels in `buildTaskDetailViewModel` (`taskStatusLabelDe`, etc.)

### Consumer wiring scope (minimal)

| File | Change type |
|------|-------------|
| `GlobalTaskDetailPanel.tsx` | Pass `locale` into view-model options |
| `VehicleTaskDetailDrawer.tsx` | Pass `locale` |
| `OperatorTaskDetail.tsx` | Pass `locale` |

Do **not** migrate full Task Detail UI strings in P216B.

---

## 16. Blind-spot guard design

Proposed guards (implementation phase):

1. **Source grep:** forbid German timeline prose literals in `taskTimeline.utils.ts` (expanded string list like P216A)
2. **Source grep:** forbid `'de-DE'` default in timeline datetime without locale parameter
3. **Source grep:** forbid `taskStatusLabelDe` import in timeline presentation path
4. **Test:** EN locale → timeline title must not match known German sentence list
5. **Test:** DE locale → matches `de['tasks.timeline.*']`
6. **Inventory:** P216B exact boundary = 0 enforce-clean findings

Guard must catch renamed maps, not only `RESOLUTION_CODE_LABELS`.

---

## 17. Test plan (implementation phase)

File: `lib/tasks/task-timeline-presentation-localization.test.tsx`

| # | Required coverage |
|---|-------------------|
| 1–2 | EN + DE timeline rendering |
| 3–8 | CREATED, STATUS_CHANGED, ASSIGNED, PRIORITY (if present), due-date/TIMING_CHANGED, COMMENT, ATTACHMENT |
| 9 | Unknown event fallback |
| 10–14 | Machine event code / status / priority / source / timestamp unchanged |
| 15 | Dynamic user data unchanged in output |
| 16 | Locale-aware datetime (no `de-DE` under EN) |
| 17–18 | No German under EN / no raw keys |
| 19 | P216B enforce-clean inventory |
| 20 | Blind-spot guard |
| 21 | At least one consumer render (`GlobalTaskDetailPanel` activity tab or view-model integration) |

Update `taskTimeline.utils.test.ts` — flip assertions from German-expected to locale-aware.

---

## 18. Runtime / business-risk audit

| Area | Risk | Mitigation |
|------|------|------------|
| Event ordering | **None** — sort unchanged | Keep sort in machine layer |
| Event generation / API | **None** | No backend changes |
| History persistence | **None** | Presentation-only |
| Workflow / mutations | **None** | Out of scope |
| Assignment / comments | **None** | Author labels presentation-only |

**Category E target: 0**

---

## 19. Shim / compat

| Metric | Value |
|--------|-------|
| Shim total | **29** |
| Timeline consumers using `../i18n/` compat | **0** |
| Target new compat consumers | **0** |

---

## 20. VehiclePickerStep baseline debt

| | Baseline post-P216A |
|---|---------------------|
| File | `rental/components/new-booking/VehiclePickerStep.tsx` |
| enforce-clean findings | **2** (lines 348, 383) |
| P216B-caused change | **None expected** |

Unrelated baseline debt — record only.

---

## 21. Accounting methodology

Report separately in implementation:

| Bucket | Description |
|--------|-------------|
| A | P216B exact scoped scanner |
| B | Hidden timeline presentation literals in utility |
| C | Known mixed-language timeline leak count |
| D | Global findings |
| E | SHARED findings |
| F | Rental findings |
| G | Unrelated drift |

---

## 22. Split decision

**Verdict: B — GO, BUT SPLIT (recommended implementation sequencing)**

| Sub-slice | Scope |
|-----------|-------|
| **P2.2.16B.1** | Event taxonomy + resolution maps + actor labels + sentence adapter + blind-spot guards |
| **P2.2.16B.2** | Locale threading through `taskDetailView` / hosts + datetime locale fix + consumer integration tests |

Rationale: timeline prose (~38 hidden literals, ~40 new keys) is separable from cross-surface locale wiring (3 hosts + view model). Single PR possible but split reduces Task Detail coupling risk and keeps P216C boundary clear.

Alternative: **A — GO as one slice** acceptable if team prefers single PR with strict file boundary enforcement.

---

## 23. Implementation contract

### P2.2.16B — Task Timeline Utilities Localization

**IN SCOPE**

- `lib/tasks/taskTimeline.utils.ts` — strip presentation
- `lib/tasks/task-timeline-presentation-i18n.ts` — new canonical adapter
- `lib/tasks/taskDetailView.utils.ts` — timeline + comment author locale wiring only
- `lib/tasks/taskDetailActions.utils.ts` — localized `humanizeResolutionReason` path
- Minimal locale pass-through: `GlobalTaskDetailPanel`, `VehicleTaskDetailDrawer`, `OperatorTaskDetail`
- `tasks.timeline.*` dictionary keys (+ EN/DE parity)
- P216B enforce-clean + blind-spot guards + tests + docs

**OUT OF SCOPE**

- P216C Task Detail UI chrome (`TaskDetailNotesActivitySection`, headers, dialogs, buttons)
- P216A frozen shared service-task presentation
- P215 Vendor Directory
- `taskSourceLabel` / `SOURCE_LABEL_DE` (unless explicitly added later)
- `rental/lib/task-timeline-display.utils.ts` (unused — optional cleanup only)
- Task workflow / business logic changes

**Acceptance criteria:** per program spec §24 (scoped debt 0, machine values unchanged, parity 100%, shim ≤ 29, P27B–P216A clean, tests meaningful, build pass).

---

## 24. Final verdict

### **B — GO, BUT SPLIT**

Task timeline presentation debt is real, scanner-blind, production-impactful (Task Detail Activity tab under EN), and safely localizable without business semantic changes. Recommend P216B.1 + P216B.2 sequencing.

---

## 25. Final report summary

| # | Field | Value |
|---|-------|-------|
| 1 | Post-P216A SHA | `1370a3841e15a506be57cd45a5cf7f2fdf2841a9` |
| 2 | Global findings | **1755** |
| 3 | SHARED findings | **35** |
| 4 | Rental findings | **488** |
| 5 | Canonical keys | **7733** |
| 6 | Parity | **100%** |
| 7 | Shim baseline | **29** |
| 8 | P216A freeze | **0** ✓ |
| 9 | taskTimeline scanner findings | **0 TEXT**; **1 FORMAT_LOCALE group** |
| 10 | Hidden presentation count | **~38** |
| 11 | Mixed-language leak count | **All timeline sentences under EN** |
| 12 | Production consumers | **7** (2 lib + 3 hosts + 2 indirect render paths) |
| 13 | Event taxonomy count | **15 cases + 7 resolution codes** |
| 14 | Reuse estimate | **~8–12 keys** |
| 15 | New-key estimate | **~35–45 keys** |
| 16 | Architecture | **Option B** — `task-timeline-presentation-i18n.ts` + machine-only utility |
| 17 | P216B scope | 4 lib files + 3 host wiring files |
| 18 | Consumer wiring | Minimal `locale` pass-through only |
| 19 | Blind-spot guard | German prose list + `de-DE` ban + EN/DE render tests |
| 20 | Test plan | 21-point matrix (see §17) |
| 21 | Category E risk | **0** (presentation-only) |
| 22 | VehiclePickerStep | **2** pre-existing enforce-clean |
| 23 | Split needed? | **Yes — recommended B.1 / B.2** |
| 24 | Audit artifact | `docs/audits/i18n-p2-2-16b-task-timeline-preflight-2026-08-21.md` |

### Explicit confirmations

| Item | Status |
|------|--------|
| Production code modified | **NO** |
| Dictionaries modified | **NO** |
| Scanner modified | **NO** |
| Tests modified | **NO** |
| P216B implementation started | **NO** |
| P216C implementation started | **NO** |
| Merged | **NO** |

---

**STOP — Do not implement P2.2.16B from this artifact alone.**
