import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperatorHandoverSuccessScreen } from './OperatorHandoverSuccessScreen';
import { OperatorHandoverConfirmDialog } from './OperatorHandoverConfirmDialog';
import { OperatorHandoverStepReview } from './OperatorHandoverStepReview';
import { createInitialHandoverState } from './operatorHandoverPayload';

const booking = {
  id: 'booking-1',
  vehicleId: 'vehicle-1',
  customerId: 'customer-1',
  vehicleName: 'VW Golf',
  plate: 'B-XY 123',
  customerName: 'Max Mustermann',
  startDate: '2026-06-01',
  endDate: '2026-06-10',
  pickupLocation: 'Berlin',
  pickupOdometerKm: 10000,
};

describe('Operator handover wizard UI', () => {
  it('renders binding finalize copy on review step', () => {
    const state = createInitialHandoverState(booking, 'PICKUP');
    state.actualStationId = 'station-1';
    state.odometerKm = '12000';
    const html = renderToStaticMarkup(
      <OperatorHandoverStepReview
        kind="PICKUP"
        booking={booking}
        form={
          {
            state,
          } as never
        }
        issues={[]}
      />,
    );
    expect(html).toContain('Übergabe verbindlich abschließen');
  });

  it('renders success confirmation without edit affordances', () => {
    const html = renderToStaticMarkup(
      <OperatorHandoverSuccessScreen
        kind="RETURN"
        vehicleLabel="VW Golf · B-XY 123"
        onDone={() => undefined}
      />,
    );
    expect(html).toContain('Rückgabe abgeschlossen');
    expect(html).toContain('kann nicht mehr bearbeitet werden');
    expect(html).toContain('Fertig');
  });

  it('renders discard draft confirmation dialog', () => {
    const html = renderToStaticMarkup(
      <OperatorHandoverConfirmDialog
        open
        title="Entwurf verwerfen?"
        message="Der gespeicherte Entwurf wird gelöscht."
        confirmLabel="Entwurf verwerfen"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain('Entwurf verwerfen?');
    expect(html).toContain('role="alertdialog"');
  });
});
