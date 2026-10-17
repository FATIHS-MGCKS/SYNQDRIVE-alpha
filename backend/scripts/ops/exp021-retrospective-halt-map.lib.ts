import { roundCoord } from './exp021-retrospective-halt-prototype.lib';

export type MapPayload = {
  title: string;
  attribution: string;
  measuredPoints: Array<{ t: string; lat: number; lon: number }>;
  gapChords: Array<{ from: string; to: string; lat0: number; lon0: number; lat1: number; lon1: number; eventId: string }>;
  events: Array<{ eventId: string; lat: number; lon: number; classification: string; label: string }>;
  trafficSignals: Array<{ id: number; lat: number; lon: number }>;
};

export function buildMapReviewHtml(payload: MapPayload): string {
  const data = JSON.stringify(payload);
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${payload.title}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    #map { height: 100vh; }
    .legend { position: absolute; z-index: 1000; bottom: 12px; left: 12px; background: #fff; padding: 10px 12px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.15); max-width: 360px; font-size: 13px; }
    .legend h3 { margin: 0 0 6px; font-size: 14px; }
    .dash { stroke-dasharray: 8 6; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="legend">
    <h3>EXP021 Rückblick-Karte</h3>
    <p>Solid: gemessene Positionen · Gestrichelt: <strong>ungemessene</strong> Lückenverbindung (Chord)</p>
    <p>Ampeln: OSM <code>highway=traffic_signals</code> (Kontext, kein Haltbeweis)</p>
    <p>${payload.attribution}</p>
  </div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const payload = ${data};
    const map = L.map('map');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    const latlngs = payload.measuredPoints.map(p => [p.lat, p.lon]);
    if (latlngs.length) {
      const line = L.polyline(latlngs, { color: '#2563eb', weight: 4, opacity: 0.85 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [40, 40] });
    }
    payload.measuredPoints.forEach(p => {
      L.circleMarker([p.lat, p.lon], { radius: 2, color: '#1d4ed8', fillOpacity: 0.7 })
        .bindTooltip(p.t, { permanent: false, direction: 'top' })
        .addTo(map);
    });
    payload.gapChords.forEach(g => {
      L.polyline([[g.lat0, g.lon0], [g.lat1, g.lon1]], { color: '#dc2626', weight: 3, dashArray: '8 6', opacity: 0.9 })
        .bindPopup('<b>' + g.eventId + '</b><br/>Ungemessene Verbindung<br/>' + g.from + ' → ' + g.to)
        .addTo(map);
    });
    payload.events.forEach(e => {
      L.marker([e.lat, e.lon]).bindPopup('<b>' + e.eventId + '</b><br/>' + e.classification + '<br/>' + e.label).addTo(map);
    });
    payload.trafficSignals.forEach(s => {
      L.circleMarker([s.lat, s.lon], { radius: 5, color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 0.9 })
        .bindTooltip('traffic_signal ' + s.id, { direction: 'top' })
        .addTo(map);
    });
  </script>
</body>
</html>`;
}

export function mapPayloadFromTrip(args: {
  presentPoints: Array<{ bucketLabelUtc: string; lat: number; lon: number }>;
  gapEvents: Array<{
    eventId: string;
    consideredWindowUtc: { from: string; to: string };
    classification: string;
    bracketBefore: Array<{ lat: number; lon: number }>;
    bracketAfter: Array<{ lat: number; lon: number }>;
  }>;
  signals: Array<{ id: number; lat: number; lon: number }>;
}): MapPayload {
  const measuredPoints = args.presentPoints.map((p) => ({
    t: p.bucketLabelUtc,
    lat: roundCoord(p.lat),
    lon: roundCoord(p.lon),
  }));
  const gapChords = args.gapEvents
    .map((e) => {
      const a = e.bracketBefore[e.bracketBefore.length - 1];
      const b = e.bracketAfter[0];
      if (!a || !b) return null;
      return {
        eventId: e.eventId,
        from: e.consideredWindowUtc.from,
        to: e.consideredWindowUtc.to,
        lat0: roundCoord(a.lat),
        lon0: roundCoord(a.lon),
        lat1: roundCoord(b.lat),
        lon1: roundCoord(b.lon),
      };
    })
    .filter(Boolean) as MapPayload['gapChords'];

  const events = args.gapEvents
    .map((e) => {
      const mid = e.bracketBefore[e.bracketBefore.length - 1] ?? e.bracketAfter[0];
      if (!mid) return null;
      return {
        eventId: e.eventId,
        lat: roundCoord(mid.lat),
        lon: roundCoord(mid.lon),
        classification: e.classification,
        label: `${e.consideredWindowUtc.from} … ${e.consideredWindowUtc.to}`,
      };
    })
    .filter(Boolean) as MapPayload['events'];

  return {
    title: 'EXP021 Retrospective Halt Map Review',
    attribution: 'Koordinaten auf 4 Dezimalstellen gerundet; keine API-Keys im Artefakt.',
    measuredPoints,
    gapChords,
    events,
    trafficSignals: args.signals.map((s) => ({ id: s.id, lat: roundCoord(s.lat), lon: roundCoord(s.lon) })),
  };
}
