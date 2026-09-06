# SynqDrive Module Authority Standard

| Field | Value |
|-------|-------|
| **Standard version** | 1.0 |
| **Status** | ACTIVE_AFTER_MERGE |
| **Established** | 2026-09-06 |
| **Scope** | All newly bootstrapped SynqDrive module authorities and controlled convergence of existing authorities |
| **Structural reference** | [`architecture/tankstellenerkennung/`](tankstellenerkennung/) |

This standard is the **mandatory protocol** for auditing and documenting modules with registry coverage status `NOT_STARTED` or `AUDIT_IN_PROGRESS`.

It defines both:

1. the **current-state audit procedure**
2. the **persistent file structure** that preserves the result

**Normative companions:**

- [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](SYNQDRIVE_RENTAL_ARCHITECTURE.md) — central module registry and coverage-status routing
- [`AGENTS.md`](../AGENTS.md) — agent onboarding and architecture-first workflow

**Pattern sources combined in this standard:**

| Authority | Contribution |
|-----------|--------------|
| [`architecture/tankstellenerkennung/`](tankstellenerkennung/) | Canonical structural reference and scientific traceability |
| [`architecture/battery-v2/`](battery-v2/) | Deep Production forensics and evidence maturity |
| [`architecture/scaling-process/`](scaling-process/) | Runtime topology and read-only VPS inspection |
| [`architecture/knowledge-graphs/automatic-trip-enrichment/`](knowledge-graphs/automatic-trip-enrichment/) · [`architecture/knowledge-graphs/energy-event-detection/`](knowledge-graphs/energy-event-detection/) | Machine-readable graphs, validators, and authority boundaries |

---

## 1. Non-negotiable principles

- The **repository must be inspected**; summaries or old memos alone are insufficient.
- For modules with a Production/runtime footprint, the **Production VPS must also be inspected read-only**.
- `origin/main` is **not** automatically identical to the deployed Production release.
- Repository intent and deployed runtime truth must be **recorded separately and reconciled**.
- **Code and verified runtime evidence** establish current behavior.
- **Documentation** preserves canonical memory, boundaries, decisions, uncertainty, and history.
- Unknown facts must remain **`UNKNOWN`**.
- Contradictions must remain **explicit** until resolved by evidence.
- **Tests**, **deployment success**, and **natural Production evidence** are different evidence classes — do not conflate them.
- No existing flat `architecture/*.md` memo becomes canonical merely because it exists.
- The audit must explain **what**, **why**, **how**, **boundaries**, **evidence**, **current state**, and **remaining uncertainty**.

---

## 2. Applicability and status routing

Registry coverage status is governed by [`SYNQDRIVE_RENTAL_ARCHITECTURE.md`](SYNQDRIVE_RENTAL_ARCHITECTURE.md). This standard applies when status is `NOT_STARTED` or `AUDIT_IN_PROGRESS`.

### `NOT_STARTED`

- Known inventory entry only.
- **No usable architecture authority exists.**
- Full repository and applicable Production audit required.
- Change registry status to `AUDIT_IN_PROGRESS` when reconstruction begins.
- **Never** infer module understanding from its name or mini description.

### `AUDIT_IN_PROGRESS`

- Partial reconstruction only.
- Existing artifacts must be read but **must not** be treated as complete.
- Missing audit surfaces and authority files must be completed.
- Status **cannot** become `AUTHORITY_ACTIVE` merely because files exist.

### `AUTHORITY_ACTIVE`

- Structured and usable living authority exists.
- Mandatory entry documents must be read before substantive work.
- Open gaps may remain if explicitly documented.
- Status means **“usable maintained authority”**, not “perfect or finished system”.

### `SUPERSEDED`

- Authority is historical.
- Successor must be named.
- Agents follow the successor and preserve historical links.

### Status transitions (not automatic)

```
NOT_STARTED → AUDIT_IN_PROGRESS → AUTHORITY_ACTIVE → SUPERSEDED
```

Each transition requires the gates defined in this standard. Arrows are **not** automatic promotions.

---

## 3. Mandatory audit phases

### Phase 0 — Entry and scope

The agent must:

1. Read root [`AGENTS.md`](../AGENTS.md).
2. Read [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](SYNQDRIVE_RENTAL_ARCHITECTURE.md).
3. Read this standard **completely**.
4. Identify the module, neighboring modules, and preliminary ownership boundaries.
5. Record the starting registry coverage status.
6. Establish whether the module has:
   - backend runtime
   - frontend runtime
   - database persistence
   - queues/workers/schedulers
   - external integrations/signals
   - Production deployment or stored Production data
7. Create or begin `AUDIT_MANIFEST.md`.
8. Set the module to `AUDIT_IN_PROGRESS` in the audit PR while reconstruction is incomplete.

### Phase 1 — Repository current-state audit

Inspect and document:

- module entry points
- frontend components, routes, hooks, state, and consumers
- backend controllers, services, repositories, domain logic, and DTOs
- database models, migrations, indexes, constraints, and persistence identity
- queues, jobs, processors, schedulers, retries, locks, and reconciliation
- external integrations, provider clients, webhooks, and signals
- configuration and feature-flag names
- caching and derived read models
- API contracts and UI presentation semantics
- tenant/org scoping and authorization boundaries
- tests, fixtures, replay tools, probes, and operational scripts
- failure paths, fallback paths, recovery behavior, and idempotency
- current root-level architecture documents and historical PR/change evidence
- dead, duplicate, stale, or competing implementations
- neighboring authorities and cross-module ownership

The agent must inspect **actual code** rather than relying only on filenames or search-result snippets.

Record the exact audited base:

| Field | Required |
|-------|----------|
| repository | yes |
| branch | yes |
| `origin/main` SHA | yes |
| audit branch SHA | yes |
| audit timestamp | yes |

### Phase 2 — Production-VPS read-only audit

Cursor Cloud Agents are expected to have configured **repository and Production-VPS access**.

At the beginning of Production inspection, verify connectivity using the existing project path:

```bash
bash .cursor/scripts/cloud-agent-verify-vps.sh
```

The agent must **never** print or document secret values.

For a runtime-bearing module, inspect applicable Production truth:

- active release directory
- deployed Git SHA
- whether deployed SHA differs from `origin/main`
- PM2/process topology and health
- nginx/routing topology where relevant
- non-secret feature-flag states
- database schema/migration state
- bounded database counts or representative records
- Redis/BullMQ queue and coordination state
- scheduler and worker liveness
- recent bounded logs
- health/readiness endpoints
- actual active consumers and data flow
- real Production evidence for claimed behavior
- known absence of natural eligible events
- observation window and data freshness

Require a **timestamp and evidence reference** for every Production claim.

#### Production read-only safety

This audit is **read-only** unless the user separately gives explicit, task-specific authorization for mutation.

**Without that separate authorization, prohibit:**

- deployment
- `cloud-agent-deploy.sh`
- PM2 restart/reload/start/stop/delete
- environment or feature-flag changes
- migrations or schema changes
- inserts, updates, deletes, DDL, or backfills
- event reprocessing
- BullMQ enqueue/retry/remove/clean/drain operations
- Redis writes, deletes, flushes, lock acquisition, or queue mutation
- editing Production files
- synthetic Production records
- invoking write endpoints
- triggering external-provider side effects

**Allowed read-only examples:**

- connectivity verification
- `git rev-parse` and release-path inspection
- `pm2 list`, `pm2 show`, or non-mutating process inspection
- bounded log reads
- HTTP GET health/readiness checks
- bounded SQL `SELECT`
- read-only PostgreSQL transactions
- Redis `GET`, `MGET`, `SCAN`, `LLEN`, `ZCARD`, or equivalent bounded reads
- filesystem listing and checksum inspection

**Require:**

- bounded queries
- statement timeouts where practical
- tenant-safe aggregation
- no full-table dumps
- no secret output
- no unnecessary personal or customer data
- sanitized evidence committed to the repository

**If Production access is unavailable:**

- record `PRODUCTION_ACCESS = UNAVAILABLE`
- record the exact non-secret blocker
- do **not** guess Production state
- keep a runtime-bearing module `AUDIT_IN_PROGRESS`
- do **not** promote it to `AUTHORITY_ACTIVE`

**If the module genuinely has no Production footprint:**

- record `PRODUCTION_NOT_APPLICABLE` with evidence and rationale

**If implemented but not deployed:**

- record `NOT_DEPLOYED` and document the verified repository/Production difference

### Phase 3 — Reconciliation and classification

Reconcile repository and Production observations.

Explicitly identify:

- code paths present and deployed
- code paths present but not deployed
- deployed behavior not represented by current `origin/main`
- configuration-dependent reachability
- dormant/dead paths
- duplicated or competing paths
- historical behavior
- contradictions
- unknowns
- unvalidated assumptions
- gaps requiring future research

Maintain **three separate status axes** — never merge into one field:

| Axis | Examples |
|------|----------|
| **Registry coverage status** | `NOT_STARTED`, `AUDIT_IN_PROGRESS`, `AUTHORITY_ACTIVE`, `SUPERSEDED` |
| **Epistemic state** | `CONFIRMED`, `INFERRED`, `HISTORICAL`, `UNKNOWN`, `CONTRADICTED` |
| **Decision / validation status** | `PROPOSED`, `EXPERIMENTAL`, `VALIDATED`, `PRODUCTION_VALIDATED`, `REJECTED`, `SUPERSEDED` |

Follow the owning module authority’s exact schema where it defines equivalent vocabulary.

### Phase 4 — Authority construction

Create all mandatory files and graphs defined in [§4 Exact mandatory directory structure](#4-exact-mandatory-directory-structure).

### Phase 5 — Validation and promotion gate

Run:

- link validation
- graph validation
- stable-ID/reference validation
- source-path existence validation
- consistency checks between README, CURRENT_STATE, decisions, evidence, graph, contradictions, and registry
- applicable module tests when needed to support an architectural claim

Only then evaluate promotion from `AUDIT_IN_PROGRESS` to `AUTHORITY_ACTIVE`.

---

## 4. Exact mandatory directory structure

For every **newly bootstrapped** module authority:

```
architecture/<module-slug>/
├── README.md
├── AUDIT_MANIFEST.md
├── CURRENT_STATE.md
├── AGENT_CONTRACT.md
├── KNOWLEDGE_GRAPH.md
│
├── graph/
│   ├── schema.yaml
│   ├── nodes.yaml
│   ├── edges.yaml
│   └── invariants.yaml
│
├── decisions/
│   └── DECISION_REGISTER.md
│
├── evidence/
│   ├── EVIDENCE_INDEX.md
│   └── PRODUCTION_BASELINE.md
│
├── contradictions/
│   ├── KNOWLEDGE_GAPS.md
│   └── OPEN_CONTRADICTIONS.md
│
├── research/
│   ├── CHANGE_LEDGER.md
│   ├── FAILED_APPROACHES.md
│   ├── OPEN_HYPOTHESES.md
│   └── OPEN_QUESTIONS.md
│
└── scripts/
    ├── validate-graph.mjs
    └── validate-graph.sh
```

**Exact filenames are mandatory** for authorities newly created after Standard 1.0 becomes active.

Additional domain-specific directories are allowed when needed (`signals/`, `lifecycle/`, `persistence/`, `execution/`, `consumers/`, `operations/`, `health-model/`, or other justified domain folders). Additional folders may **extend** but never **replace** the mandatory core.

---

## 5. Required content per file

### `README.md`

Must contain:

- module name
- purpose
- scope
- explicit non-scope
- ownership boundaries
- registry coverage status
- authority-native status
- maturity
- runtime impact
- mandatory entry documents
- validation commands
- neighboring authorities
- legacy/supporting documents

### `AUDIT_MANIFEST.md`

Fixed metadata table — at minimum:

| Field | Description |
|-------|-------------|
| `MODULE` | Human-readable module name |
| `MODULE_SLUG` | Directory slug under `architecture/` |
| `AUDIT_STARTED_AT` | ISO timestamp |
| `AUDIT_COMPLETED_AT` | ISO timestamp or `IN_PROGRESS` |
| `REGISTRY_STATUS_AT_START` | Coverage status when audit began |
| `REGISTRY_STATUS_AT_END` | Coverage status when audit completed |
| `REPOSITORY` | Repository identifier |
| `REPO_BASE_BRANCH` | Base branch (normally `main`) |
| `ORIGIN_MAIN_SHA` | `origin/main` SHA at audit time |
| `AUDIT_BRANCH_SHA` | Audit workstream branch SHA |
| `PRODUCTION_AUDITED_AT` | ISO timestamp or `N/A` |
| `PRODUCTION_ACCESS` | `VERIFIED_READ_ONLY` · `PRODUCTION_NOT_APPLICABLE` · `NOT_DEPLOYED` · `PRODUCTION_ACCESS_UNAVAILABLE` |
| `PRODUCTION_RELEASE_SHA` | Deployed SHA or `N/A` |
| `PRODUCTION_RELEASE_PATH` | Active release path or `N/A` |
| `REPO_PRODUCTION_DRIFT` | Drift summary |
| `RUNTIME_FOOTPRINT` | Backend/frontend/DB/queue/integration summary |
| `AUDIT_MODE` | `READ_ONLY` |
| `VALIDATION_STATUS` | Validator outcome |
| `REMAINING_LIMITATIONS` | Explicit residual limits |

Must also include an **audit-coverage matrix** listing every inspected repository and Production surface, evidence, result, and limitation.

### `CURRENT_STATE.md`

Best-known state at a precise timestamp:

- executive summary
- audited repository baseline
- audited Production baseline
- repo-versus-Production comparison
- end-to-end flow
- component hierarchy
- configuration and reachability
- persistence and identity
- jobs/workers/schedulers
- API and UI consumers
- failure/recovery behavior
- confirmed invariants
- current limitations
- explicit non-claims
- open gaps and contradictions
- last verified evidence

Do **not** mix planned architecture into current state.

### `AGENT_CONTRACT.md`

Must define:

- mandatory read-first sequence
- substantive-change definition
- same-workstream/PR documentation duty
- ownership boundaries
- prohibited silent changes
- evidence requirements
- status-axis separation
- stable-ID policy
- Production mutation prohibition
- validation commands
- completion report requirements

### `KNOWLEDGE_GRAPH.md`

Human-readable overview containing:

- nodes/components
- execution and data-flow edges
- ownership edges
- invariants
- decisions
- evidence
- consumers
- external dependencies
- open gaps
- epistemic legend

Must agree with `graph/*.yaml`.

### `graph/schema.yaml`

Define:

- allowed node types
- allowed relationship types
- stable-ID rules
- required fields
- epistemic states
- decision/validation statuses
- evidence reference rules

### `graph/nodes.yaml`

Stable, non-recycled module-prefixed IDs for:

- components
- data stores
- queues/jobs
- policies
- decisions
- evidence
- external dependencies
- consumers
- gaps/contradictions where represented

### `graph/edges.yaml`

Explicit directional relationships such as:

`invokes` · `consumes` · `produces` · `persists` · `reads` · `enqueues` · `processes` · `schedules` · `reconciles` · `projects_to` · `governs` · `gates` · `depends_on` · `owned_by` · `tested_by` · `supported_by` · `superseded_by`

Each edge must reference existing node IDs.

### `graph/invariants.yaml`

Non-negotiable rules with:

- stable invariant ID
- statement
- scope
- epistemic state
- evidence references
- risk if violated
- owning authority

### `decisions/DECISION_REGISTER.md`

Every substantive decision must preserve:

- ID
- status
- BEFORE
- WHY
- considered alternatives
- CHANGE
- EXPECTED_EFFECT
- VALIDATION
- OBSERVED_EFFECT
- NON_EFFECTS
- TRADEOFFS
- REMAINING_GAPS
- EVIDENCE
- supersession information where applicable

### `evidence/EVIDENCE_INDEX.md`

Index evidence by stable ID. Classify source type, for example:

`CODE` · `TEST` · `INTEGRATION_TEST` · `PRODUCTION_OBSERVATION` · `HUMAN_GROUND_TRUTH` · `HISTORICAL_RECORD`

For each entry record:

- source path
- timestamp
- audited SHA/environment
- claim supported
- maturity/confidence
- limitations

Do **not** treat one evidence class as another.

### `evidence/PRODUCTION_BASELINE.md`

Mandatory even when Production is unavailable or not applicable.

Must contain:

- audit timestamp
- access result
- deployed release and SHA
- observed topology
- relevant flags
- databases/queues/workers/schedulers
- bounded logs and health observations
- real data-path observations
- freshness and observation window
- repo-versus-Production drift
- confirmed claims
- unresolved or unobservable claims
- explicit non-mutations performed

Allowed terminal states:

- `VERIFIED_READ_ONLY`
- `PRODUCTION_NOT_APPLICABLE`
- `NOT_DEPLOYED`
- `PRODUCTION_ACCESS_UNAVAILABLE`

Never leave Production status implicit.

### `contradictions/KNOWLEDGE_GAPS.md`

Track missing knowledge or evidence:

- stable gap ID
- affected component
- current epistemic status
- why the gap matters
- evidence required
- resolution owner/path

### `contradictions/OPEN_CONTRADICTIONS.md`

Track sources that disagree. Preserve both sides until evidence resolves the conflict. Never silently delete resolved contradictions; mark resolution and successor evidence.

### `research/CHANGE_LEDGER.md`

Append-only history of:

- audit phases
- important PRs/commits
- architecture evolution
- authority updates
- status transitions
- Production observations

### `research/FAILED_APPROACHES.md`

Record rejected or failed approaches with:

- intended goal
- why attempted
- result
- why rejected
- side effects/non-effects
- replacement
- reusable lesson

### `research/OPEN_HYPOTHESES.md`

Hypotheses must include:

- stable ID
- statement
- reason
- falsification method
- required evidence
- current status

Never present hypotheses as facts.

### `research/OPEN_QUESTIONS.md`

Track unresolved questions, owner/authority, required evidence, and whether the question blocks `AUTHORITY_ACTIVE`.

### `scripts/validate-graph.mjs`

Validate at minimum:

- YAML parseability
- unique stable IDs
- prefix/type rules
- required fields
- allowed statuses
- edge references
- invariant evidence references
- source-path existence
- gap/question references
- agreement between graph manifest and authority metadata where applicable

### `scripts/validate-graph.sh`

Fail-fast repository-root wrapper for the module validator.

---

## 6. Promotion gate to `AUTHORITY_ACTIVE`

A module may transition from `AUDIT_IN_PROGRESS` to `AUTHORITY_ACTIVE` **only when**:

- [ ] every mandatory core file exists
- [ ] repository audit is complete for the declared scope
- [ ] Production audit is `VERIFIED_READ_ONLY`, or a justified `PRODUCTION_NOT_APPLICABLE` / `NOT_DEPLOYED` state is documented
- [ ] repository and Production SHAs are recorded separately
- [ ] scope and ownership boundaries are explicit
- [ ] end-to-end data flow is documented
- [ ] decisions and their WHY are preserved
- [ ] evidence is indexed
- [ ] gaps, contradictions, hypotheses, and failed approaches are preserved
- [ ] machine and human graph agree
- [ ] validators pass
- [ ] mandatory links and source paths resolve
- [ ] registry row and detailed authority section are updated
- [ ] remaining limitations are explicit

**For a runtime-bearing deployed module, `PRODUCTION_ACCESS_UNAVAILABLE` blocks promotion to `AUTHORITY_ACTIVE`.**

Open product or research gaps do **not** automatically block `AUTHORITY_ACTIVE` if the current architecture is accurately reconstructed and the gaps are explicit.

---

## 7. Existing-authority transition rule

The five existing authorities must **not** be downgraded or broadly rewritten solely because Standard 1.0 exists:

- Tankstellenerkennung
- Battery V2
- Scaling Process
- ATE (KG-ATE)
- EED (KG-EED)

They predate Standard 1.0 and remain `AUTHORITY_ACTIVE`.

For pre-existing authorities:

- equivalent existing artifacts may satisfy the semantic intent of a mandatory standard file
- missing standardized filenames are **not** grounds for automatic downgrade
- do **not** create duplicate documents containing the same authority
- on the next substantive module workstream, inspect standard conformance
- create a missing standard file only when its content is not already canonically represented elsewhere
- otherwise document the equivalent-file mapping
- any unresolved conformance gap must remain explicit

**All new module authorities created after Standard 1.0 must use the exact mandatory structure.**

---

## 8. Definition of done for a current-state audit

A current-state audit is **not complete** until:

- [ ] registry coverage status handled correctly (`NOT_STARTED` → `AUDIT_IN_PROGRESS` → promotion only via gate)
- [ ] repository SHA captured
- [ ] Production release SHA captured separately
- [ ] Production access/result classified (`VERIFIED_READ_ONLY`, `PRODUCTION_NOT_APPLICABLE`, `NOT_DEPLOYED`, or `PRODUCTION_ACCESS_UNAVAILABLE`)
- [ ] no unauthorized Production mutations
- [ ] complete component and data-flow reconstruction for declared scope
- [ ] tenant/auth boundaries inspected
- [ ] failure and recovery paths documented
- [ ] decisions and alternatives preserved
- [ ] evidence indexed with correct source types
- [ ] gaps, contradictions, and hypotheses separated
- [ ] human and machine graphs aligned
- [ ] validator and link checks passing
- [ ] registry entry updated in [`SYNQDRIVE_RENTAL_ARCHITECTURE.md`](SYNQDRIVE_RENTAL_ARCHITECTURE.md)
- [ ] final response lists files created/updated, evidence sources, limitations, and status transition
