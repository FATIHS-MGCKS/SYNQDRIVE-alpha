# Master Admin — Screen / Hub Matrix

**SHA:** UX-006 closeout · **Epistemic:** CONFIRMED (routing); CONFIRMED (organization detail tabs)  
**Contract:** [`NAVIGATION_URL_CONTRACT.md`](../../../governance/NAVIGATION_URL_CONTRACT.md) (MASTER_NAVIGATION_CONTRACT)

| `?view=` | Root component | PageContainer | URL helpers | Notes |
|----------|----------------|---------------|-------------|-------|
| dashboard | `MasterDashboardView` | wide | `view` | |
| organizations | `OrganizationsView` / `OrganizationDetailView` | standard | `orgId`, `orgTab` | 8 detail tabs; scrollable `MasterPageTabs` + active-tab scroll-into-view (UX-005) |
| prospects | `ProspectsView` | standard | | |
| security-access | `SecurityAccessHub` | wide | `security-access-url` | 7 sections |
| vehicles | `ConnectedVehiclesHub` | wide | `cvSection`, vehicle ids | |
| device-inventory | `PhysicalDeviceInventoryHub` | wide | | |
| vehicle-logbook | `VehicleLogbookView` | standard | | |
| billing | `BillingControlCenter` | wide | `masterBilling*` | multi-section |
| product-management | `ProductManagementView` | standard **(in-view)** | | `PageContainer` inside view; App.tsx does not double-wrap (UX-001 verified) |
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