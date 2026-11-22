# Rental — Screen / View Matrix

**Audited SHA:** `413175e8ca72355764a3d47936ad7eff78d415aa`  
**State mechanism:** in-memory `currentView` + URL sync helpers in `frontend/src/rental/App.tsx` (not React Router per view).  
**Shell:** Rental `AppShell` + `Sidebar.tsx` (`frontend/src/rental/components/Sidebar.tsx`).

| View id | Primary component | Nav (sidebar) | Vehicle context | Epistemic | Source |
|---------|-------------------|---------------|-----------------|-----------|--------|
| dashboard | `DashboardView` | top-level | fleet | CONFIRMED | `rental/App.tsx` |
| bookings | `BookingsView` | top-level | — | CONFIRMED | |
| new-booking | `NewBookingView` | entry action | — | CONFIRMED | |
| customers | `CustomersView` | top-level | — | CONFIRMED | |
| customer-detail | `CustomerDetailView` | drilldown | — | CONFIRMED | |
| stations | `StationsView` | top-level | flag-gated | CONFIRMED | Stations V2 flags |
| station-detail | `StationDetailView` | drilldown | — | CONFIRMED | |
| tasks | `TasksView` | top-level | — | CONFIRMED | |
| communication-center | `CommunicationCenterView` | top-level | perm-gated | CONFIRMED | |
| financial-insights | `EvaluationsPage` | finance section | — | CONFIRMED | |
| invoices | `FinanceView` tab | finance | — | CONFIRMED | |
| price-tariffs | `FinanceView` tab | finance | — | CONFIRMED | |
| customer-payments | `FinanceView` tab | finance | perm-gated | CONFIRMED | |
| fines | `FinesView` | finance (via view) | — | CONFIRMED | |
| workflow-automation | `WorkflowAutomationView` | automation | perm-gated | CONFIRMED | |
| insurances | `InsurancesView` | integrations | — | CONFIRMED | |
| parts-accessories | `PartsAccessoriesView` | integrations | — | CONFIRMED | |
| settings | `SettingsView` | administration | multi-tab | CONFIRMED | account/company/users/… |
| support | `SupportView` | utility | — | CONFIRMED | |
| help-center | `HelpCenterView` | utility | — | CONFIRMED | |
| data-analyse | `DataAnalyseView` | utility | perm-gated | CONFIRMED | |
| document-upload | `DocumentUploadView` | utility / shortcuts | — | CONFIRMED | |
| ai-assistant | `AIAssistantView` | utility | — | CONFIRMED | |
| fleet | `FleetHubView` | fleet shortcut | tabs inside | CONFIRMED | |
| vendor-detail | `VendorDetailView` | fleet drilldown | — | CONFIRMED | |
| overview | `VehicleOverviewTab` | vehicle chrome | required | CONFIRMED | `VehicleDetailTabPanel` |
| trips | `TripsView` | vehicle tab | required | CONFIRMED | |
| health-errors | `HealthErrorsView` | vehicle tab | required | CONFIRMED | |
| damages | `DamagesView` | vehicle tab | required | CONFIRMED | |
| documents | `DocumentsView` | vehicle tab | required | CONFIRMED | |
| vehicle-bookings | `VehicleBookingsView` | vehicle tab | required | CONFIRMED | |
| vehicle-tasks | `VehicleTasksView` | vehicle tab | required | CONFIRMED | |
| vehicle-requirements | `VehicleRequirementsTab` | vehicle tab | required | CONFIRMED | |
| connectivity | `VehicleConnectivityTab` | vehicle tab | required | CONFIRMED | |
| whatsapp-business | (legacy URL resolve) | INFERRED | — | INFERRED | URL migration helpers |
| ai-voice-assistant | sub-route of communication | INFERRED | — | INFERRED | |

## Fleet hub interior (CONFIRMED partial)

`FleetHubView` orchestrates tabs (`FleetTab`: status, condition-service, …) and health-service sub-nav — see `fleet-health-service.types.ts`. Full tab matrix **INFERRED** without opening entire file.

## Settings tabs (CONFIRMED)

`settingsTypes.ts` drives account, company, users, data-authorization, email-versand, rental-rules, billing (permission gated).

## Responsive rules (CONFIRMED from Sidebar)

- Mobile drawer `< lg`; collapse at `lg+`.  
- `nav-primitives` + `components/shell` shared classes.  
- **UNKNOWN:** full breakpoint matrix per view.

## Loading / empty / error

Pattern library usage heavy (`EmptyState`, `ErrorState`, skeletons) — CONFIRMED on stations flag-disabled path and dashboard imports; per-view coverage **PARTIAL**.