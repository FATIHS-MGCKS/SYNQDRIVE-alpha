# Current runtime activation matrix (pre–VO-3 cutover)

Captured at VO-3 implementation anchor. **Legacy paths unchanged in VO-3.**

| Entry | Service | Vehicle create timing | VIN | Provider link | Consent | Billing / side effects |
|-------|---------|----------------------|-----|---------------|---------|------------------------|
| DIMO | `VehiclesService.registerFromDimo` | Immediate in TX | `dimoVehicle.vin \|\| DIMO-{externalId}` **(debt)** | `DimoVehicleDataSourceLinkService.ensureDimoVehicleDataSourceLinkOrThrow` in TX | `VehicleProviderConsentService.recordDimoConsent` fire-and-forget post-TX | capability refresh, battery enqueue, enrichment, tire/brake init, billing |
| HM_ONLY | `HighMobilityRegistrationService.registerHmOnlyVehicle` | Immediate in TX | HM mirror VIN | `vehicleDataSourceLink` HM_ONLY in TX | not canonical consent writer | HM mirror update in TX |
| Manual | `VehiclesService.create` | Immediate | caller-supplied | varies | varies | legacy hooks |

**Canonical VO-3 path:** case-only until `VehicleOnboardingActivationService.activateVehicle`; **no synthetic VIN**; consent materialized idempotently inside activation TX.
