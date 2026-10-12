# R1 — Vehicle identity and consent (pointer)

Detailed auth chain: [`AUTHENTICATION_AND_PRIVILEGES.md`](AUTHENTICATION_AND_PRIVILEGES.md).

## SynqDrive-owned mapping

- `DimoVehicleDataSourceLinkService` — link lifecycle between org vehicle and DIMO asset.
- Device-connection episodes — consent/connectivity provenance for plug/unplug.
- Vehicle sync worker — periodic identity reconciliation (`dimo.vehicle.sync`).

## Historical exclusions

- Former-fleet tokenId **190497** — do not reauthorize without owner decision (see R9 permission audit evidence).

## Open questions

- Full offboarding checklist across mirrors, triggers, scheduler eligibility — see [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md).
