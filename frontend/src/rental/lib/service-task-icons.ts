import {
  Battery,
  Calendar,
  ClipboardList,
  Disc,
  Droplets,
  Eye,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ApiTaskType } from '../../lib/api';

const TYPE_ICONS: Partial<Record<ApiTaskType, LucideIcon>> = {
  VEHICLE_SERVICE: Wrench,
  REPAIR: Wrench,
  VEHICLE_INSPECTION: Eye,
  TIRE_CHECK: Disc,
  BRAKE_CHECK: Disc,
  BATTERY_CHECK: Battery,
  VEHICLE_CLEANING: Droplets,
  CUSTOM: ClipboardList,
};

export function taskTypeIcon(type: ApiTaskType): LucideIcon {
  return TYPE_ICONS[type] ?? Calendar;
}
