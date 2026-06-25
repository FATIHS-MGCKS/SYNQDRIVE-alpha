import type { CustomerDocumentRecord } from '../CustomerDocumentUploadBox';

import type { StressLevel } from '../../lib/scoreFormat';



export interface CustomerListRow {

  id: string;

  name: string;

  email: string;

  phone: string;

  company?: string;

  type: 'Individual' | 'Corporate';

  status: 'Active' | 'Under Review' | 'Suspended' | 'Blocked' | 'Archived' | 'Inactive';

  riskLevel: 'Not Assessed' | 'Low Risk' | 'Medium Risk' | 'High Risk';

  drivingStressScore?: number | null;

  stressLevel?: StressLevel | null;

  hasEnoughData?: boolean;

  dataConfidence?: 'none' | 'low' | 'medium' | 'high';

  scoredTripCount?: number;

  totalDistanceKm?: number;

  lastTrip: string;

  totalBookings: number;

  totalRevenue: string;

  joinDate: string;

  licenseExpiry: string;

  licenseVerified: boolean;

  idVerified: boolean;

  accidents: number;

  violations: number;

  city: string;

  currentVehicle?: string;

  notes?: string;

}



export type CustomerDetailTab =

  | 'overview'

  | 'bookings'

  | 'documents'

  | 'finances'

  | 'driving'

  | 'timeline';



export type CustomerDetail = {

  id: string;

  firstName?: string | null;

  lastName?: string | null;

  email?: string | null;

  phone?: string | null;

  address?: string | null;

  city?: string | null;

  zip?: string | null;

  country?: string | null;

  company?: string | null;

  taxId?: string | null;

  customerType?: string | null;

  riskLevel?: string | null;

  riskReason?: string | null;

  riskSource?: string | null;

  riskUpdatedAt?: string | null;

  status?: string | null;

  notes?: string | null;

  dateOfBirth?: string | null;

  licenseNumber?: string | null;

  licenseExpiry?: string | null;

  licenseClass?: string | null;

  licenseVerified?: boolean | null;

  idType?: string | null;

  idNumber?: string | null;

  idExpiry?: string | null;

  idVerified?: boolean | null;

  idVerificationStatus?: string | null;

  licenseVerificationStatus?: string | null;

  idFrontUrl?: string | null;

  idBackUrl?: string | null;

  licenseFrontUrl?: string | null;

  licenseBackUrl?: string | null;

  createdAt?: string | null;

  updatedAt?: string | null;

  archivedAt?: string | null;

  bookings?: BookingRow[] | null;

  drivingStressScore?: number | null;

  stressLevel?: StressLevel | null;

  scoreEligibleTripCount?: number | null;

  scoredTripCount?: number | null;

  totalDistanceKm?: number | null;

  hasEnoughData?: boolean | null;

  dataConfidence?: 'none' | 'low' | 'medium' | 'high' | null;

  totalRevenueCents?: number | null;

  lastBookingDate?: string | null;

};



export type BookingRow = {

  id: string;

  bookingNumber?: string | null;

  status?: string | null;

  startDate?: string | null;

  endDate?: string | null;

  totalPriceCents?: number | null;

  dailyRateCents?: number | null;

  currency?: string | null;

  kmDriven?: number | null;

  kmIncluded?: number | null;

  pickupStationId?: string | null;

  returnStationId?: string | null;

  vehicle?: {

    id?: string;

    licensePlate?: string | null;

    make?: string | null;

    model?: string | null;

    year?: number | null;

  } | null;

};



export type CustomerEligibility = {

  customerId: string;

  canCreatePendingBooking: boolean;

  canConfirmBooking: boolean;

  canStartRental: boolean;

  blockingReasons: string[];

  warnings: string[];

  requiredActions: string[];

};



export type DrivingAggregateMeta = {

  analysisCount: number;

  drivingEvents: number;

  abuseEvents: number;

  lastAnalysisAt: string | null;

};



export type KycDocSlot = {

  slot: 'id-front' | 'id-back' | 'license-front' | 'license-back' | 'proof-of-address';

  label: string;

  type: string;

  documentType: 'ID_FRONT' | 'ID_BACK' | 'LICENSE_FRONT' | 'LICENSE_BACK' | 'PROOF_OF_ADDRESS';

  document: CustomerDocumentRecord | null;

  legacyPreviewUrl: string | null;

  statusLabel: string;

};



export type EligibilityStage = 'allowed' | 'warning' | 'blocked';

