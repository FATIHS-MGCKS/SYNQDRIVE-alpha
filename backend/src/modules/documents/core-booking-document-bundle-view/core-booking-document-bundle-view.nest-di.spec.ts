import { Test } from '@nestjs/testing';
import { CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT } from '@modules/platform-channels/ports/core-booking-document-bundle-view.port';
import { CoreBookingDocumentBundleViewAdapter } from './core-booking-document-bundle-view.adapter';
import { BookingDocumentBundleService } from '../booking-document-bundle.service';

describe('CoreBookingDocumentBundleViewModule — token binding', () => {
  it('resolves CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT to the adapter (useExisting)', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CoreBookingDocumentBundleViewAdapter,
        {
          provide: BookingDocumentBundleService,
          useValue: { getBundleView: jest.fn() },
        },
        {
          provide: CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT,
          useExisting: CoreBookingDocumentBundleViewAdapter,
        },
      ],
    }).compile();

    const port = moduleRef.get(CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT);
    expect(port).toBeInstanceOf(CoreBookingDocumentBundleViewAdapter);
    await moduleRef.close();
  });
});