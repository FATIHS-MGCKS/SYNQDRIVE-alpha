# Master Admin — Screen / Hub Matrix

**SHA:** `413175e8c` · **Epistemic:** CONFIRMED (routing); PARTIAL (all sub-tabs)

| `?view=` | Root component | PageContainer | URL helpers | Notes |
|----------|----------------|---------------|-------------|-------|
| dashboard | `MasterDashboardView` | wide | `view` | |
| organizations | `OrganizationsView` / `OrganizationDetailView` | standard | `orgId`, `orgTab` | 8 detail tabs |
| prospects | `ProspectsView` | standard | | |
| security-access | `SecurityAccessHub` | wide | `security-access-url` | 7 sections |
| vehicles | `ConnectedVehiclesHub` | wide | `cvSection`, vehicle ids | |
| device-inventory | `PhysicalDeviceInventoryHub` | wide | | |
| vehicle-logbook | `VehicleLogbookView` | standard | | |
| billing | `BillingControlCenter` | wide | `masterBilling*` | multi-section |
| product-management | `ProductManagementView` | **none** | | **GAP** |
| platform-integrations | `PlatformIntegrationsHub` | wide | `platform-integrations-url` | 5 tabs |
| service-client-management | `CoreAppServiceClientsHub` | wide | | |
| vsi-intelligence | `VsiMasterIntelligenceView` | wide | intelligence URL | |
| apds-intelligence | `ApdsMasterIntelligenceView` | wide | | |
| high-mobility | `HighMobilityDataView` | standard | `hmTab` | |
| parts-accessories | `PartsAccessoriesAdminView` | standard | | |
| insurances | `InsurancesAdminView` | standard | | |
| voice-assistant | `VoiceAssistantAdminView` | wide | `voiceSection`, `voiceOrgId` | |
| platform-ops | `PlatformOpsHub` | wide | `platform-ops-url` | 7 sections |
| support | `SupportView` | full | | 3-column ops |
| battery-v2-shadow-inspection | `BatteryV2ShadowInspectionView` | wide | | engineering |
| battery-v2-hv-inspection | `HvBatteryInspectionView` | wide | | |
| tire-v3-calibration-center | `TireCalibrationCenterView` | wide | | |
| architektur | `ArchitekturView` | standard | `archCategory` | |
| changes | `ChangesView` | standard | | large internal changelog UI |

**Source:** `frontend/src/master/App.tsx`, `master/navigation/master-nav.config.ts`.  
**Hub subnav detail:** [`MASTER_HUB_SUBNAV.md`](MASTER_HUB_SUBNAV.md).