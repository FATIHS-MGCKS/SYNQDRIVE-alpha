import fs from 'fs';

const filePath = 'c:/Users/FS93/Desktop/SynqDrive Cursor Project/frontend/src/rental/components/BookingsView.tsx';
const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

let start = -1;
for (let i = 0; i < lines.length; i++) {
  if (
    lines[i].trim() === 'return (' &&
    lines[i + 1]?.includes('max-w-[1800px] mx-auto relative space-y-5')
  ) {
    start = i;
  }
}

let end = -1;
if (start >= 0) {
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === '<DetailDrawer' && lines[i + 1]?.includes('open={!!popupBooking}')) {
      end = i - 1;
      break;
    }
  }
}

if (start < 0 || end < 0) {
  console.error('markers not found', { start, end });
  process.exit(1);
}

const insert = `  const plannerBookings = useMemo(() => {
    const apiIds = new Set(apiBookings.map((b) => b.id));
    const extraRows = additionalBookings
      .filter((b) => b?.id && !apiIds.has(b.id))
      .map((b) => (b.bookingRef ? (b as BookingUiRow) : mapApiBooking(b)));
    return applyEdits([...apiBookings, ...extraRows]);
  }, [apiBookings, additionalBookings, localCancelled, localEdits]);

  return (
    <>
      <BookingsPage
        bookings={plannerBookings}
        loading={!apiLoaded && !apiError}
        error={apiError}
        onRetry={loadBookings}
        fleetVehicles={fleetVehicles}
        stations={apiStations.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))}
        onCreateNewBooking={onCreateNewBooking}
        onOpenDetail={(id) => setDetailBookingId(id)}
        onOpenDrawer={(id) => {
          setPopupBookingId(id);
          setSelectedBookingId(id);
        }}
        onCancelBooking={(id) => setCancelConfirmId(id)}
      />

`;

const newLines = [...lines.slice(0, start), ...insert.split('\n'), ...lines.slice(end + 1)];

for (let i = newLines.length - 1; i >= 0; i--) {
  if (newLines[i].trim() === '</div>' && newLines[i + 1]?.trim() === ');') {
    newLines[i] = '    </>';
    break;
  }
}

fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
console.log('patched', { start, end, removed: end - start + 1 });
