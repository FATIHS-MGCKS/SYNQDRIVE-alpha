import { Icon } from '../ui/Icon';
import type { TripTimelineTrip } from './timeline.types';
import { TripStatusBadge } from './TripStatusBadge';

interface TripAssignmentBadgeProps {
  trip: TripTimelineTrip;
}

export function TripAssignmentBadge({ trip }: TripAssignmentBadgeProps) {
  if (trip.isPrivateTrip) {
    return <TripStatusBadge label="Privat" tone="private" />;
  }
  if (trip.assignmentStatus === 'PRIVATE_UNASSIGNED' || trip.assignmentStatus === 'UNKNOWN_ASSIGNMENT') {
    return <TripStatusBadge label="Nicht zugewiesen" tone="neutral" />;
  }
  if (trip.assignmentStatus === 'ASSIGNED_BOOKING_CUSTOMER') {
    return <TripStatusBadge label="Buchung verknüpft" tone="info" />;
  }
  if (trip.driverName) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Icon name="user" className="w-3 h-3 shrink-0" />
        {trip.driverName}
      </span>
    );
  }
  return null;
}
