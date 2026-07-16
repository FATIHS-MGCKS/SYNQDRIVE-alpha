# Battery HV Method Profile

**Prompt:** 46/78  
**Resolver version:** `HV_METHOD_PROFILE_RESOLVER_VERSION` 1.0.0

## Zweck

Kanonisches HV-Methodenprofil je Fahrzeug aus persistierten `VehicleBatteryCapability`-Rows. Keine Kapazitätsberechnung — nur Signal- und Methoden-Verfügbarkeit.

## Output

| Feld | Semantik |
|------|----------|
| `socAvailable` | `hv.soc` mit Daten (`AVAILABLE` / `AVAILABLE_STALE`) |
| `currentEnergyAvailable` | `hv.current_energy` mit Daten |
| `addedEnergyAvailable` | `hv.added_energy` mit Daten |
| `rechargeSegmentsAvailable` | `dimo.segments.recharge` mit Segmenten |
| `isChargingAvailable` | `hv.is_charging` mit Daten |
| `chargingCableConnectedAvailable` | `hv.cable_connected` mit Daten |
| `providerSohAvailable` | `hv.provider_soh` mit Daten |
| `grossCapacityAvailable` | `hv.gross_capacity` mit Daten |
| `packTemperatureAvailable` | `hv.pack_temperature` mit Daten |
| `chargingPowerAvailable` | `hv.charging_power` mit Daten |
| `currentPowerAvailable` | `hv.current_power` mit Daten |
| `supportedCapacityMethods` | Eligible Methoden ohne Berechnung |
| `unsupportedReasons` | Strukturierte Gründe (Signal/Method) |
| `lastCheckedAt` | Max `checkedAt` der HV-Capabilities |
| `dataQuality` | Aggregiert aus operativen Capabilities |

## Supported Capacity Methods

| Methode | Voraussetzung |
|---------|----------------|
| `M2_CURRENT_ENERGY_SOC` | SOC + Current Energy |
| `M3_ADDED_ENERGY_DELTA_SOC` | Recharge Segments + Added Energy + SOC |
| `PROVIDER_HV_SOH` | Provider SOH |
| `SESSION_CHARGE_CAPACITY` | Recharge Segments + Added Energy |
| `GROSS_CAPACITY_REFERENCE` | Gross Capacity Signal |

## KS FH 660E Audit (Tesla Model 3)

| Signal/Methode | Erwartung |
|----------------|-----------|
| Recharge Segments | ja |
| SOC / Current Energy / Added Energy | ja |
| IsCharging / Cable | ja |
| Current Power | ja |
| Provider SOH | nein (`NOT_LISTED`) |
| Pack Temperature | nein |
| Gross Capacity | nein |
| Charging Power | nein |
| M2 / M3 / SESSION | ja |
| PROVIDER_HV_SOH / GROSS_CAPACITY | nein |

## Pipeline

```
VehicleBatteryCapability rows
  → HvMethodProfileService.resolveForVehicle()
  → resolveHvMethodProfile()
  → HvMethodProfile
```

## Implementierung

- `hv-method-profile.resolver.ts`
- `hv-method-profile.service.ts`
- Signal-Keys aus `battery-capability-signals.registry.ts`
