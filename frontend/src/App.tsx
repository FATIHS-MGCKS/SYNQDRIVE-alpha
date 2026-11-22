import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated, getStoredUser, hasUiAuditMasterShellAccess, resolveUiAuditProductLandingPath } from './lib/auth';
import { AppThemeProvider } from './context/AppThemeContext';
import { LanguageProvider } from './i18n/LanguageContext';
import MasterApp from './master/App';
import RentalApp from './rental/App';
import OperatorApp from './operator/OperatorApp';
import LoginPage from './pages/LoginPage';
import VerificationDonePage from './pages/VerificationDonePage';
import ServiceInfoV3DevFixturePage from './pages/dev/ServiceInfoV3DevFixturePage';
import HealthErrorsServiceModalDevPage from './pages/dev/HealthErrorsServiceModalDevPage';

function ProtectedRoute({
  children,
  requiredRole,
  allowUiAuditMasterShell,
}: {
  children: React.ReactNode;
  requiredRole?: string;
  allowUiAuditMasterShell?: boolean;
}) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  if (requiredRole) {
    const user = getStoredUser();
    const roleOk = user && user.platformRole === requiredRole;
    const auditMasterOk =
      allowUiAuditMasterShell && requiredRole === 'MASTER_ADMIN' && hasUiAuditMasterShellAccess();
    if (user && !roleOk && !auditMasterOk) {
      return <Navigate to={resolveUiAuditProductLandingPath()} replace />;
    }
  }
  return <>{children}</>;
}

function LoginRoute() {
  if (isAuthenticated()) {
    return <Navigate to={resolveUiAuditProductLandingPath()} replace />;
  }
  return <LoginPage />;
}

function DefaultRedirect() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={resolveUiAuditProductLandingPath()} replace />;
}

export default function App() {
  return (
    <AppThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/verification/done" element={<VerificationDonePage />} />
            {import.meta.env.DEV ? (
              <>
                <Route path="/dev/service-info-v3" element={<ServiceInfoV3DevFixturePage />} />
                <Route path="/dev/health-errors-service-modal" element={<HealthErrorsServiceModalDevPage />} />
              </>
            ) : null}
            <Route
              path="/master"
              element={
                <ProtectedRoute requiredRole="MASTER_ADMIN" allowUiAuditMasterShell>
                  <MasterApp />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rental"
              element={
                <ProtectedRoute>
                  <RentalApp />
                </ProtectedRoute>
              }
            />
            <Route
              path="/operator/*"
              element={
                <ProtectedRoute>
                  <OperatorApp />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<DefaultRedirect />} />
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </AppThemeProvider>
  );
}
