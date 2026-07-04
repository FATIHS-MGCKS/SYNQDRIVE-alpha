import { VendorManagementView } from '../VendorManagementView';

interface FleetHealthServiceVendorsPanelProps {
  onOpenVendorDetail?: (vendor: import('../../../lib/api').Vendor) => void;
}

export function FleetHealthServiceVendorsPanel({
  onOpenVendorDetail,
}: FleetHealthServiceVendorsPanelProps) {
  return (
    <VendorManagementView
      embedded
      embeddedInServiceCenter
      onOpenDetail={onOpenVendorDetail}
    />
  );
}
