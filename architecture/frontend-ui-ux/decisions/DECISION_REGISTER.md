# Shared UI Design Foundation — Decision Register

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| FEUX-DEC-PLATFORM-PROFILES-001 | Single authority + three product profiles only | SUPERSEDED | FEUX-EVID-AUDIT-BOOTSTRAP-001 |
| FEUX-DEC-INDEPENDENT-AUTHORITIES-002 | Shared foundation + three independent product UI/UX authorities | VALIDATED | FEUX-EVID-AUDIT-BOOTSTRAP-001 |
| FEUX-DEC-CHANGE-ISOLATION-001 | PRODUCT_LOCAL / SHARED_FOUNDATION / NO_SILENT_PROPAGATION rules | VALIDATED | FEUX-EVID-AUDIT-BOOTSTRAP-001 |
| FEUX-DEC-SHARED-TOKEN-SSOT-001 | theme.css + contracts as shared visual SSOT | VALIDATED | FEUX-EVID-CODE-THEME-001 |
| FEUX-DEC-NO-I18N-DUP-001 | No competing i18n authority | VALIDATED | FEUX-EVID-CROSS-I18N-001 |
| FEUX-DEC-RENTAL-REFERENCE-001 | Rental as positive reference (cross-product doc only) | PROPOSED | FEUX-EVID-CODE-RENTAL-001 |
| FEUX-DEC-FIGMA-PRECEDENCE-001 | Registered architecture + tokens default; Figma reference on approved redesign | VALIDATED | FEUX-EVID-AGENT-ROUTING-2026-11-23 |
| FEUX-DEC-AGENT-READ-FIRST-001 | Mandatory FEUX read-first order for all frontend agents | VALIDATED | FEUX-EVID-AGENT-ROUTING-2026-11-23 |

---

## FEUX-DEC-PLATFORM-PROFILES-001

| Field | Value |
|-------|-------|
| **STATUS** | SUPERSEDED (successor: FEUX-DEC-INDEPENDENT-AUTHORITIES-002) |
| **BEFORE** | PR #2490 bootstrap modeled one FEUX registry row with three **product profiles** under a single authority tree (no per-product registry rows). |
| **WHY** | Owner refinement: Master, Rental, and Operator need **independent** module-authority governance (graphs, manifests, decisions) while keeping one shared design foundation. |
| **Considered alternatives** | (A) Keep single authority + profile annexes only — rejected: insufficient for MODULE_AUTHORITY_STANDARD promotion gates. (B) Four fully isolated repos — rejected: violates SYNQDRIVE-alpha monorepo binding. |
| **CHANGE** | Superseded registry/doc shape; product trees moved under `architecture/frontend-ui-ux/products/*`. |
| **EXPECTED_EFFECT** | Historical readers find explicit successor pointer; no silent reuse of profile-only model. |
| **VALIDATION** | Registry lists four `AUDIT_IN_PROGRESS` rows; foundation README cross-links products. |
| **OBSERVED_EFFECT** | **CONFIRMED** in repository at `413175e8c` audit baseline — four registry entries present after remediation PR #2490. Production UI effect **UNKNOWN**. |
| **NON_EFFECTS** | Does not remove shared `theme.css` / `components/ui` runtime coupling. |
| **TRADEOFFS** | More documentation surface area; clearer ownership. |
| **REMAINING_GAPS** | Gate A Production UI verification still open (FEUX-EVID-GAP-PROD-UI-001). |
| **EVIDENCE** | FEUX-EVID-AUDIT-BOOTSTRAP-001 |

---

## FEUX-DEC-INDEPENDENT-AUTHORITIES-002

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (repository documentation) |
| **BEFORE** | No registered FEUX module; product UI knowledge fragmented across `docs/ui` and ad-hoc notes. |
| **WHY** | Establish durable, validator-backed architectural memory for shared L0–L4 design system **and** product-specific UX authorities without claiming AUTHORITY_ACTIVE prematurely. |
| **Considered alternatives** | (A) Defer registry until Production audit — rejected: blocks structured in-repo audit. (B) Merge all UX into Rental authority — rejected: violates product boundaries. |
| **CHANGE** | Registry: **Shared UI Design Foundation**, **Master Admin UI/UX**, **Rental UI/UX**, **Operator UI/UX** — all `AUDIT_IN_PROGRESS`. Mandatory MODULE_AUTHORITY_STANDARD trees + graph validators per module. |
| **EXPECTED_EFFECT** | Agents route UI work to correct authority; cross-product edits require explicit change class in `governance/CROSS_PRODUCT_CHANGE_POLICY.md`. |
| **VALIDATION** | `validate-graph.sh` (×4) + `validate-module-registry.sh` on PR #2490 branch. |
| **OBSERVED_EFFECT** | **CONFIRMED** — validators pass on closeout branch at documentation SHA (see AUDIT_MANIFEST `VALIDATION_RUN_SHA`). Live deploy alignment **UNKNOWN**. |
| **NON_EFFECTS** | No Figma SSOT in repo; no browser/a11y certification. |
| **TRADEOFFS** | Four graphs to maintain; avoids single overloaded authority. |
| **REMAINING_GAPS** | AUTHORITY_ACTIVE promotion blocked until Production read-only UI gate satisfied. |
| **EVIDENCE** | FEUX-EVID-AUDIT-BOOTSTRAP-001 |

---

## FEUX-DEC-CHANGE-ISOLATION-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (policy documented) |
| **BEFORE** | No explicit cross-product UI change taxonomy in architecture/. |
| **WHY** | Prevent silent propagation of product-local UX experiments into shared tokens/components. |
| **Considered alternatives** | (A) Informal code-review only — rejected: insufficient for multi-product SPA. (B) Physical package split — rejected: out of scope for Alpha monolith. |
| **CHANGE** | `governance/CROSS_PRODUCT_CHANGE_POLICY.md` defines `PRODUCT_LOCAL`, `SHARED_FOUNDATION`, `NO_SILENT_PROPAGATION`. |
| **EXPECTED_EFFECT** | Substantive PRs declare change class; shared edits require foundation authority touch. |
| **VALIDATION** | Policy file present; referenced in AGENT_CONTRACT and README. |
| **OBSERVED_EFFECT** | **CONFIRMED** policy exists at audit SHA. Developer compliance rate **UNKNOWN**. |
| **NON_EFFECTS** | Does **not** claim runtime CSS/module isolation today (shared bundle). |
| **TRADEOFFS** | Process overhead vs. cross-product regression risk reduction. |
| **REMAINING_GAPS** | Automated enforcement beyond graph validator **UNKNOWN**. |
| **EVIDENCE** | FEUX-EVID-AUDIT-BOOTSTRAP-001 |

---

## FEUX-DEC-SHARED-TOKEN-SSOT-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (code SSOT named) |
| **BEFORE** | Tokens scattered across Tailwind config, local classes, and product shells without single architecture pointer. |
| **WHY** | One SPA build shares visual language; architecture must name the canonical token layer. |
| **Considered alternatives** | (A) Per-product theme files — rejected for foundation SSOT (still allowed product accents). (B) Figma-only SSOT — rejected: Figma not in repo (FEUX-EVID-GAP-FIGMA-001). |
| **CHANGE** | Document `frontend/src/styles/theme.css` + `frontend/src/components/ui` + `frontend/src/components/patterns` as foundation SSOT. |
| **EXPECTED_EFFECT** | Foundation changes trace to FEUX; products adapt via patterns not ad-hoc forks. |
| **VALIDATION** | `FEUX-EVID-CODE-THEME-001` spot-check; import graph sampled in patterns barrel. |
| **OBSERVED_EFFECT** | **CONFIRMED** theme file and pattern exports at `413175e8c`. Pixel-perfect parity vs. Figma **UNKNOWN**. |
| **NON_EFFECTS** | Does not mandate dark-mode completeness per product view. |
| **TRADEOFFS** | Central SSOT vs. product velocity for experimental chrome. |
| **REMAINING_GAPS** | Full L0–L4 line audit not completed. |
| **EVIDENCE** | FEUX-EVID-CODE-THEME-001 |

---

## FEUX-DEC-NO-I18N-DUP-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (boundary) |
| **BEFORE** | Risk of duplicate locale dictionaries or competing providers in UI/UX authority. |
| **WHY** | i18n governance already owned by platform authority (`frontend/src/i18n/*`); FEUX must not fork translations. |
| **Considered alternatives** | (A) Embed i18n in FEUX — rejected per `.cursor/rules/i18n.mdc`. (B) English-only UX docs — rejected. |
| **CHANGE** | FEUX documents read-only boundary; product copy changes defer to i18n authority with 9-locale rule. Master `tMasterNav` debt noted, not solved here. |
| **EXPECTED_EFFECT** | No new translation files under `architecture/frontend-ui-ux/`. |
| **VALIDATION** | Cross-read `locales.ts` + Master nav i18n file list in evidence. |
| **OBSERVED_EFFECT** | **CONFIRMED** canonical provider paths at audit SHA. Completeness of 9 locales per new UI string **UNKNOWN** in this workstream. |
| **NON_EFFECTS** | Does not fix Master hardcoded nav labels. |
| **TRADEOFFS** | Slower UX copy iteration vs. single ownership. |
| **REMAINING_GAPS** | Master `master-nav-i18n.ts` migration to platform i18n **OPEN**. |
| **EVIDENCE** | FEUX-EVID-CROSS-I18N-001 |

---

## FEUX-DEC-RENTAL-REFERENCE-001

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | Informal team habit to treat Rental chrome as template for other products. |
| **WHY** | Rental has mature patterns but Master/Operator have distinct IA; architecture should name Rental as **reference** not **donor**. |
| **Considered alternatives** | (A) Mandate Rental layout for Master — rejected. (B) Ignore Rental — rejected: loses positive patterns. |
| **CHANGE** | Foundation matrix cites Rental as reference; RENTUX authority owns Rental-specific evolution (RENTUX-DEC-REFERENCE-001). |
| **EXPECTED_EFFECT** | Shared foundation extracts primitives; products keep local shell contracts. |
| **VALIDATION** | Cross-link in README + rental CURRENT_STATE. |
| **OBSERVED_EFFECT** | **UNKNOWN** — cultural/process outcome not measured. Code coupling **CONFIRMED** (shared components). |
| **NON_EFFECTS** | No automatic UI porting from Rental to Master/Operator. |
| **TRADEOFFS** | Consistency vs. product-fit UX. |
| **REMAINING_GAPS** | Quantified drift metrics between shells **UNKNOWN**. |
| **EVIDENCE** | FEUX-EVID-CODE-RENTAL-001 |

---

## FEUX-DEC-FIGMA-PRECEDENCE-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (governance) |
| **BEFORE** | Root `AGENTS.md`, `projektregel.mdc`, and `Figma-rule.mdc` treated Figma as unconditional visual SSOT; conflicted with FEUX-DEC-SHARED-TOKEN-SSOT-001 and FEUX-EVID-GAP-FIGMA-001. |
| **WHY** | Agents must not let stale or unverified Figma override implemented tokens and registered product authorities. |
| **Considered alternatives** | (A) Delete all Figma rules — rejected: owner-approved redesigns still need Figma MCP. (B) Figma-only SSOT — rejected: no in-repo Figma SSOT. |
| **CHANGE** | `governance/FIGMA_AND_VISUAL_PRECEDENCE.md`; remediated Cursor rules and `AGENTS.md`. |
| **EXPECTED_EFFECT** | Default work follows `architecture/frontend-ui-ux/`; Figma used when explicitly scoped. |
| **VALIDATION** | `validate-ui-ux-agent-routing.mjs` + `validate-graph.sh`. |
| **OBSERVED_EFFECT** | **CONFIRMED** at documentation merge on branch (repo validators pass). Runtime agent compliance **UNKNOWN**. |
| **NON_EFFECTS** | Does not add Figma files to repo; does not certify WCAG or production UI. |
| **TRADEOFFS** | More read-first steps vs. fewer mistaken redesigns from obsolete artboards. |
| **REMAINING_GAPS** | External Figma file ↔ production alignment still **UNKNOWN**. |
| **EVIDENCE** | FEUX-EVID-AGENT-ROUTING-2026-11-23 |

---

## FEUX-DEC-AGENT-READ-FIRST-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (governance) |
| **BEFORE** | FEUX `AGENT_CONTRACT` listed reads but root agent instructions did not mandate foundation + product routing for all frontend tasks. |
| **WHY** | One canonical four-domain authority tree requires enforced entry path for every UI change class. |
| **Considered alternatives** | (A) Optional “recommended reads” — rejected. (B) Single mega-doc — rejected: preserves product independence. |
| **CHANGE** | `CANONICAL_AUTHORITY_MAP.md`; expanded shared and product `AGENT_CONTRACT.md`; `AGENTS.md` frontend section. |
| **EXPECTED_EFFECT** | Agents locate correct authority before editing tokens, shells, or inventories. |
| **VALIDATION** | Graph validator agent-routing checks; registry unchanged (`AUDIT_IN_PROGRESS`). |
| **OBSERVED_EFFECT** | **CONFIRMED** governance files present at PR SHA. Cannot prove agents read docs without human process. |
| **NON_EFFECTS** | No AUTHORITY_ACTIVE promotion; no application code changes. |
| **TRADEOFFS** | Validator enforces file presence, not human attention. |
| **REMAINING_GAPS** | CI cannot attest read compliance — by design. |
| **EVIDENCE** | FEUX-EVID-AGENT-ROUTING-2026-11-23 |