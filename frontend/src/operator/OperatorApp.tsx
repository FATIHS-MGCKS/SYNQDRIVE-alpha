import { Navigate, Route, Routes } from 'react-router-dom';

import { Toaster } from 'sonner';

import { OperatorAccessGuard } from './components/OperatorAccessGuard';

import { OperatorShell } from './OperatorShell';

import { RentalProvider } from '../rental/RentalContext';

const shellRoutes = (
  <>
    <Route index element={<OperatorShell />} />
    <Route path="vehicles/:vehicleId" element={<OperatorShell />} />
    <Route path="vehicles/:vehicleId/damage" element={<OperatorShell />} />
    <Route path="bookings/:bookingId" element={<OperatorShell />} />
    <Route path="bookings/:bookingId/handover" element={<OperatorShell />} />
    <Route path="bookings/:bookingId/return" element={<OperatorShell />} />
    <Route path="tasks/:taskId" element={<OperatorShell />} />
    <Route path="drafts/:draftId" element={<OperatorShell />} />
  </>
);

export default function OperatorApp() {
  return (
    <RentalProvider>
      <OperatorAccessGuard>
        <Routes>
          {shellRoutes}
          <Route path="*" element={<Navigate to="/operator" replace />} />
        </Routes>
        <Toaster position="top-center" richColors closeButton />
      </OperatorAccessGuard>
    </RentalProvider>
  );
}
