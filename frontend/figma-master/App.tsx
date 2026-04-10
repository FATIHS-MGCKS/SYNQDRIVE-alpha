import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import type { MasterView } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { RightSidebar } from './components/RightSidebar';
import { MasterDashboardView } from './components/MasterDashboardView';
import { OrganizationsView } from './components/OrganizationsView';
import { OrganizationDetailView } from './components/OrganizationDetailView';
import { PlatformUsersView } from './components/PlatformUsersView';
import { PlatformVehiclesView } from './components/PlatformVehiclesView';
import { SubscriptionsView } from './components/SubscriptionsView';
import { ActivityLogView } from './components/ActivityLogView';
import { SupportView } from './components/SupportView';
import { PlatformSettingsView } from './components/PlatformSettingsView';
import { ProspectsView } from './components/ProspectsView';
import { Toaster, toast } from 'sonner';
import type { Organization, PlatformUser, RegisteredVehicle, DimoVehicle } from './data/platform-data';
import { initialOrganizations, initialUsers, initialRegisteredVehicles, initialDimoVehicles } from './data/platform-data';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentView, setCurrentView] = useState<MasterView>('dashboard');
  const [settingsTab, setSettingsTab] = useState<string>('general');

  // Centralized data state
  const [organizations, setOrganizations] = useState<Organization[]>(initialOrganizations);
  const [users, setUsers] = useState<PlatformUser[]>(initialUsers);
  const [registeredVehicles, setRegisteredVehicles] = useState<RegisteredVehicle[]>(initialRegisteredVehicles);
  const [dimoVehicles, setDimoVehicles] = useState<DimoVehicle[]>(initialDimoVehicles);

  // Connection states
  const [dimoConnected, setDimoConnected] = useState(true);
  const [stripeConnected, setStripeConnected] = useState(true);

  // Organization detail
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

  // ============ ORGANIZATION CRUD ============
  const handleAddOrg = (org: Organization) => {
    setOrganizations(prev => [org, ...prev]);
    toast.success(`Organization "${org.company_name}" created`);
  };
  const handleUpdateOrg = (org: Organization) => {
    setOrganizations(prev => prev.map(o => o.id === org.id ? org : o));
    if (selectedOrg?.id === org.id) setSelectedOrg(org);
    toast.success(`Organization "${org.company_name}" updated`);
  };
  const handleDeleteOrg = (id: string) => {
    const org = organizations.find(o => o.id === id);
    setOrganizations(prev => prev.filter(o => o.id !== id));
    setUsers(prev => prev.filter(u => u.organizationId !== id));
    setRegisteredVehicles(prev => prev.filter(v => v.organizationId !== id));
    toast.success(`Organization "${org?.company_name}" deleted`);
  };

  // ============ USER CRUD ============
  const handleAddUser = (user: PlatformUser) => {
    setUsers(prev => [user, ...prev]);
    // Update org user count
    setOrganizations(prev => prev.map(o => o.id === user.organizationId ? { ...o, users: o.users + 1 } : o));
  };
  const handleUpdateUser = (user: PlatformUser) => {
    setUsers(prev => prev.map(u => u.id === user.id ? user : u));
    toast.success(`User "${user.name}" updated`);
  };
  const handleDeleteUser = (id: string) => {
    const user = users.find(u => u.id === id);
    setUsers(prev => prev.filter(u => u.id !== id));
    if (user) {
      setOrganizations(prev => prev.map(o => o.id === user.organizationId ? { ...o, users: Math.max(0, o.users - 1) } : o));
    }
    toast.success('User deleted');
  };

  // ============ VEHICLE REGISTRATION ============
  const handleRegisterVehicle = (vehicle: RegisteredVehicle, dimoId: string) => {
    setRegisteredVehicles(prev => [vehicle, ...prev]);
    setDimoVehicles(prev => prev.filter(d => d.id !== dimoId));
    // Update org fleet size
    setOrganizations(prev => prev.map(o => o.id === vehicle.organizationId ? { ...o, fleet_size: o.fleet_size + 1 } : o));
    toast.success(`Vehicle "${vehicle.vehicleName}" registered to ${vehicle.organizationName}`);
  };

  // ============ CONNECTIONS ============
  const handleDimoToggle = () => {
    setDimoConnected(prev => !prev);
  };
  const handleStripeToggle = () => {
    setStripeConnected(prev => {
      toast.success(prev ? 'Stripe disconnected' : 'Stripe connected');
      return !prev;
    });
  };

  // Helper: get org users/vehicles
  const getOrgUsers = (orgId: string) => users.filter(u => u.organizationId === orgId);
  const getOrgVehicles = (orgId: string) => registeredVehicles.filter(v => v.organizationId === orgId);

  return (
    <div
      className={`size-full flex overflow-hidden ${isDarkMode ? 'bg-neutral-950' : 'bg-gray-50'}`}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <Toaster position="top-right" richColors closeButton theme={isDarkMode ? 'dark' : 'light'} />

      <Sidebar
        isDarkMode={isDarkMode}
        currentView={currentView}
        onViewChange={(view) => { setCurrentView(view); setSelectedOrg(null); }}
        settingsTab={settingsTab}
        onSettingsTabChange={setSettingsTab}
      />

      <div className="flex-1 flex flex-col overflow-hidden pt-16 lg:pt-0">
        <TopBar
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          currentView={currentView}
          settingsTab={settingsTab}
        />

        <div className={`flex-1 overflow-auto px-6 sm:px-12 lg:px-16 pt-8 lg:pt-10 pb-14 ${isDarkMode ? 'text-gray-100' : ''}`}>
          <div className="max-w-[1400px] mx-auto">

            {/* DASHBOARD */}
            {currentView === 'dashboard' && (
              <MasterDashboardView isDarkMode={isDarkMode} />
            )}

            {/* ORGANIZATIONS */}
            {currentView === 'organizations' && !selectedOrg && (
              <OrganizationsView
                isDarkMode={isDarkMode}
                organizations={organizations}
                onSelectOrg={setSelectedOrg}
                onAddOrg={handleAddOrg}
                onUpdateOrg={handleUpdateOrg}
                onDeleteOrg={handleDeleteOrg}
              />
            )}
            {currentView === 'organizations' && selectedOrg && (
              <OrganizationDetailView
                isDarkMode={isDarkMode}
                org={selectedOrg}
                orgUsers={getOrgUsers(selectedOrg.id)}
                orgVehicles={getOrgVehicles(selectedOrg.id)}
                onBack={() => setSelectedOrg(null)}
                onUpdateOrg={handleUpdateOrg}
              />
            )}

            {/* USERS */}
            {currentView === 'users' && (
              <PlatformUsersView
                isDarkMode={isDarkMode}
                users={users}
                organizations={organizations}
                onAddUser={handleAddUser}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
              />
            )}

            {/* VEHICLES */}
            {currentView === 'vehicles' && (
              <PlatformVehiclesView
                isDarkMode={isDarkMode}
                registeredVehicles={registeredVehicles}
                dimoVehicles={dimoVehicles}
                organizations={organizations}
                dimoConnected={dimoConnected}
                onRegisterVehicle={handleRegisterVehicle}
              />
            )}

            {/* SUBSCRIPTIONS */}
            {currentView === 'subscriptions' && (
              <SubscriptionsView isDarkMode={isDarkMode} />
            )}

            {/* ACTIVITY LOG */}
            {currentView === 'activity-log' && (
              <ActivityLogView isDarkMode={isDarkMode} />
            )}

            {/* SUPPORT */}
            {currentView === 'support' && (
              <SupportView isDarkMode={isDarkMode} />
            )}

            {/* SETTINGS */}
            {currentView === 'settings' && (
              <PlatformSettingsView
                isDarkMode={isDarkMode}
                activeTab={settingsTab}
                onTabChange={setSettingsTab}
                dimoConnected={dimoConnected}
                onDimoToggle={handleDimoToggle}
                stripeConnected={stripeConnected}
                onStripeToggle={handleStripeToggle}
              />
            )}

            {/* PROSPECTS */}
            {currentView === 'prospects' && (
              <ProspectsView isDarkMode={isDarkMode} />
            )}

          </div>
        </div>
      </div>

      <RightSidebar isDarkMode={isDarkMode} />
    </div>
  );
}