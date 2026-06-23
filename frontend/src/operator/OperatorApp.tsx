import { Navigate, Route, Routes } from 'react-router-dom';

import { Toaster } from 'sonner';

import { OperatorAccessGuard } from './components/OperatorAccessGuard';

import { OperatorShell } from './OperatorShell';

import { RentalProvider } from '../rental/RentalContext';



export default function OperatorApp() {

  return (

    <RentalProvider>

      <OperatorAccessGuard>

        <Routes>

          <Route index element={<OperatorShell />} />

          <Route path="vehicles/:vehicleId" element={<OperatorShell />} />

          <Route path="bookings/:bookingId" element={<OperatorShell />} />

          <Route path="*" element={<Navigate to="/operator" replace />} />

        </Routes>

        <Toaster position="top-center" richColors closeButton />

      </OperatorAccessGuard>

    </RentalProvider>

  );

}

