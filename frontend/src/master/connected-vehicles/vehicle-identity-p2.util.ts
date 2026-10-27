export function isVehicleIdentityP2Enabled(): boolean {
  return import.meta.env.VITE_ZB1_VEHICLE_IDENTITY_P2_ENABLED === 'true';
}

export type VehicleIdentityProvenanceUi =
  | 'DOCUMENT_EXTRACTED'
  | 'DIMO_PROVIDER'
  | 'MOTION_PHYSICS_REFERENCE'
  | 'AI_ESTIMATED'
  | 'MANUAL_ENTRY'
  | 'USER_CONFIRMED'
  | 'UNCONFIRMED'
  | 'UNAVAILABLE'
  | 'CONFLICT';

export function provenanceBadgeClass(
  provenance: VehicleIdentityProvenanceUi,
  isDarkMode: boolean,
): string {
  const base = 'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium';
  switch (provenance) {
    case 'DOCUMENT_EXTRACTED':
      return `${base} ${isDarkMode ? 'bg-blue-900/40 text-blue-200' : 'bg-blue-100 text-blue-800'}`;
    case 'DIMO_PROVIDER':
      return `${base} ${isDarkMode ? 'bg-violet-900/40 text-violet-200' : 'bg-violet-100 text-violet-800'}`;
    case 'MOTION_PHYSICS_REFERENCE':
      return `${base} ${isDarkMode ? 'bg-cyan-900/40 text-cyan-200' : 'bg-cyan-100 text-cyan-800'}`;
    case 'AI_ESTIMATED':
      return `${base} ${isDarkMode ? 'bg-fuchsia-900/40 text-fuchsia-200' : 'bg-fuchsia-100 text-fuchsia-800'}`;
    case 'MANUAL_ENTRY':
      return `${base} ${isDarkMode ? 'bg-amber-900/40 text-amber-200' : 'bg-amber-100 text-amber-800'}`;
    case 'USER_CONFIRMED':
      return `${base} ${isDarkMode ? 'bg-emerald-900/40 text-emerald-200' : 'bg-emerald-100 text-emerald-800'}`;
    case 'UNCONFIRMED':
      return `${base} ${isDarkMode ? 'bg-zinc-700/60 text-zinc-300' : 'bg-zinc-200 text-zinc-700'}`;
    case 'CONFLICT':
      return `${base} ${isDarkMode ? 'bg-red-900/40 text-red-200' : 'bg-red-100 text-red-800'}`;
    default:
      return `${base} ${isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-600'}`;
  }
}

export function provenanceLabelKey(provenance: VehicleIdentityProvenanceUi): string {
  switch (provenance) {
    case 'DOCUMENT_EXTRACTED':
      return 'master.vehicleIdentity.provenance.document';
    case 'DIMO_PROVIDER':
      return 'master.vehicleIdentity.provenance.dimo';
    case 'MOTION_PHYSICS_REFERENCE':
      return 'master.vehicleIdentity.provenance.motionPhysics';
    case 'AI_ESTIMATED':
      return 'master.vehicleIdentity.provenance.aiEstimated';
    case 'MANUAL_ENTRY':
      return 'master.vehicleIdentity.provenance.manual';
    case 'USER_CONFIRMED':
      return 'master.vehicleIdentity.provenance.confirmed';
    case 'UNCONFIRMED':
      return 'master.vehicleIdentity.provenance.unconfirmed';
    case 'CONFLICT':
      return 'master.vehicleIdentity.provenance.conflict';
    default:
      return 'master.vehicleIdentity.provenance.unavailable';
  }
}
