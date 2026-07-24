# Data Processing Wizard (Prompt 35)

**Date:** 2026-07-24  
**Scope:** Guided 7-step creation wizard replacing the legacy single-step create dialog  
**Parent:** `docs/architecture/data-processing-information-architecture-2026-07.md`

## Wizard steps

| Step | ID | Content |
|------|-----|---------|
| 1 | Vorgangstyp | Internal processing, provider access, partner sharing, consent, processor agreement |
| 2 | Zweck & Rechtsgrundlage | Title, activity code, purpose, legal basis, necessity, privacy notice |
| 3 | Daten & Betroffene | Purposes, categories, subject types, frequency, scope |
| 4 | Konkrete Ressourcen | Tenant-scoped vehicle/customer/booking/station pickers |
| 5 | Empfänger & Transfer | Provider scopes, processor, requesting entity, destination, DPA, transfer |
| 6 | Retention & Schutz | Retention class, duration, deletion method, TOMs, legal hold |
| 7 | Risiko & Review | DPIA status, reviewer notes, save draft / request review |

## Validation

- **Client:** `data-processing-wizard.validation.ts` — per-step (`draft`) and full (`review`) modes
- **Draft save:** procedure type + title + valid activity code minimum
- **Review request:** all required fields per procedure type; no activation endpoints called
- **No auto-defaults:** `requestingEntity` not derived from title; `destination` not prefilled with platform name
- **Scope rules:** VEHICLE/CUSTOMER/BOOKING/CONNECTED_VEHICLES require matching entity selections
- **Double-submit guard:** `submitLockRef` + `submitting` state in dialog

## API binding (sequential on save)

All data stays client-side until **Save draft** or **Request review**. Cancel with discard confirm creates **no server records**.

| Order | Endpoint | When |
|-------|----------|------|
| 1 | `POST .../processing-activity-register` | Always (DRAFT activity) |
| 2 | `POST .../processing-activities/:id/legal-basis-assessments` | If legal basis set |
| 3 | `POST .../processing-activities/:id/retention-deletion/policies` | If retention triple complete |
| 4 | `POST .../provider-access-grants` | Provider access (PENDING) |
| 5 | `POST .../data-processing-agreements` | Processor agreement (DRAFT) |
| 6 | `POST .../data-authorizations` | Partner sharing / consent legacy row |
| 7 | `POST .../processing-activities/:id/data-subject-consents` | Consent procedure |
| 8 | `POST .../review-workflow/processing-activities/:id/submit` | Request review only |

Orchestration: `frontend/src/rental/lib/data-processing-wizard.api.ts`

## Permissions

| Procedure | Frontend gate |
|-----------|----------------|
| All create | `data-authorization` write |
| Request review | `data-authorization` manage |
| Per-type cards | `canCreateInternal`, `canCreateProvider`, etc. (currently all map to write) |

Extended in `data-processing-permissions.ts`. Hub passes `canWrite` / `canManage` from `SettingsView`.

## Components

- `DataProcessingWizardDialog.tsx` — shell, navigation, submit
- `DataProcessingWizardSteps.tsx` — seven step panels
- `TenantEntityScopePicker.tsx` — debounced org-scoped search
- Lib: `data-processing-wizard.{types,constants,validation,utils,api}.ts`

Entry: **Neuer Vorgang** button on `DataProcessingPageHeader` (when `canCreate`).

## Tests

```bash
cd frontend && npm test -- data-processing
```

| File | Tests |
|------|-------|
| `data-processing-wizard.validation.test.ts` | 6 |
| `data-processing-wizard.utils.test.ts` | 3 |
| `data-processing-wizard.ui.test.tsx` | 4 |
| `data-processing.ui.test.tsx` | 14 (+ create CTA) |
| `data-processing-readiness.test.ts` | 7 |

**Total data-processing suite: 34 passed**

## Explicit non-goals (Prompt 35)

- No direct activation (provider grant activate, DPA activate, policy activate)
- No edit wizard for existing records (Prompt 36)
- Legacy `DataAuthorizationCreateDialog.tsx` retained but superseded at hub level
