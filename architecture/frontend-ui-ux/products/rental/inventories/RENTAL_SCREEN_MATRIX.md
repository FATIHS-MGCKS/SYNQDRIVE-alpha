# Rental — Screen / View Matrix

**Audited code SHA:** `413175e8ca72355764a3d47936ad7eff78d415aa`  
**State mechanism:** in-memory `currentView` + URL sync in `frontend/src/rental/App.tsx`  
**Shell:** `frontend/src/rental/components/Sidebar.tsx` + `components/TopBar.tsx` (layout via `App.tsx`)

| View id | Primary component | Epistemic | Source path (`frontend/src/rental/...`) |
|---------|-------------------|-----------|----------------------------------------|
| dashboard | `DashboardView` | CONFIRMED | `components/DashboardView.tsx` |
| bookings | `BookingsView` | CONFIRMED | `components/BookingsView.tsx` |
| new-booking | `NewBookingView` | CONFIRMED | `components/NewBookingView.tsx` |
| customers | `CustomersView` | CONFIRMED | `components/CustomersView.tsx` |
| customer-detail | `CustomerDetailView` | CONFIRMED | `components/CustomerDetailView.tsx` |
| stations | `StationsView` | CONFIRMED | `components/stations/StationsView.tsx` |
| station-detail | `StationDetailView` | CONFIRMED | `components/stations/StationDetailView.tsx` |
| tasks | `TasksView` | CONFIRMED | `components/TasksView.tsx` |
| communication-center | `CommunicationCenterView` | CONFIRMED | `components/communication-center/CommunicationCenterView.tsx` |
| financial-insights | `EvaluationsPage` | CONFIRMED | `components/evaluations/EvaluationsPage.tsx` |
| invoices / price-tariffs / customer-payments | `FinanceView` tabs | CONFIRMED | `components/FinanceView.tsx` + `components/finance-navigation.ts` |
| fines | `FinesView` | CONFIRMED | `components/FinesView.tsx` |
| workflow-automation | `WorkflowAutomationView` | CONFIRMED | `components/WorkflowAutomationView.tsx` |
| insurances | `InsurancesView` | CONFIRMED | `components/InsurancesView.tsx` |
| parts-accessories | `PartsAccessoriesView` | CONFIRMED | `components/PartsAccessoriesView.tsx` |
| settings | `SettingsView` | CONFIRMED | `components/SettingsView.tsx` |
| support | `SupportView` | CONFIRMED | `components/SupportView.tsx` |
| help-center | `HelpCenterView` | CONFIRMED | `components/HelpCenterView.tsx` |
| data-analyse | `DataAnalyseView` | CONFIRMED | `components/DataAnalyseView.tsx` |
| document-upload | `DocumentUploadView` | CONFIRMED | `components/DocumentUploadView.tsx` |
| ai-assistant | `AIAssistantView` | CONFIRMED | `components/AIAssistantView.tsx` |
| fleet | `FleetHubView` | CONFIRMED | `components/FleetHubView.tsx` |
| vendor-detail | `VendorDetailView` | CONFIRMED | `components/VendorDetailView.tsx` |
| overview | vehicle tab | CONFIRMED | `components/vehicle-detail/VehicleOverviewTab.tsx` |
| trips | `TripsView` | CONFIRMED | `components/TripsView.tsx` |
| health-errors | `HealthErrorsView` | CONFIRMED | `components/HealthErrorsView.tsx` |
| damages | `DamagesView` | CONFIRMED | `components/DamagesView.tsx` |
| documents | `DocumentsView` | CONFIRMED | `components/DocumentsView.tsx` |
| vehicle-bookings | `VehicleBookingsView` | CONFIRMED | `components/VehicleBookingsView.tsx` |
| vehicle-tasks | `VehicleTasksView` | CONFIRMED | `components/VehicleTasksView.tsx` |
| vehicle-requirements | tab | CONFIRMED | `components/vehicle-detail/VehicleRequirementsTab.tsx` |
| connectivity | tab | CONFIRMED | `components/vehicle-detail/VehicleConnectivityTab.tsx` |
| whatsapp-business | settings / communication | INFERRED | `components/whatsapp/WhatsAppBusinessSettings.tsx` (**PARTIAL** — full view union not re-parsed) |
| ai-voice-assistant | communication route | INFERRED | `components/communication-center/legacy-communication-navigation.ts` (**PARTIAL**) |

## Fleet hub — top tabs (CONFIRMED)

From `components/fleet-health-service/fleet-health-service.types.ts` and `components/FleetHubView.tsx`:

| Tab id | Primary surface | Source |
|--------|-----------------|--------|
| status | `FleetView` | `components/FleetView.tsx` |
| condition-service | `FleetHealthServiceView` | `components/fleet-health-service/FleetHealthServiceView.tsx` |
| connectivity | `FleetConnectivityTab` | `components/fleet-connectivity/FleetConnectivityTab.tsx` |

Legacy `health` / `service` → `normalizeFleetTab()`.

## Fleet hub — inner nav under condition-service (CONFIRMED)

`FleetHealthServiceTab`: `overview` \| `vehicles` \| `work` \| `history`  
Work sections: `tasks` \| `service-cases` \| `schedule` \| `vendors`  
Types: `components/fleet-health-service/fleet-health-service.types.ts`

## Settings interior (CONFIRMED)

`components/settings/settingsTypes.ts`

## Responsive (CONFIRMED)

`components/Sidebar.tsx` — drawer `< lg`.

## Loading / empty / error

**PARTIAL** — not enumerated per view.