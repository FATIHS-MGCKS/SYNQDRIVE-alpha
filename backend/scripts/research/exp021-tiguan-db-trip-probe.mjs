import pg from 'pg';

const url = process.env.DATABASE_URL?.replace(/\?schema=[^&]*/, '') ?? '';
const vid = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const v = await client.query(
  'SELECT id, license_plate, dimo_token_id, organization_id FROM vehicles WHERE id = $1',
  [vid],
);
console.log(JSON.stringify({ vehicle: v.rows }, null, 2));
const trips = await client.query(
  `SELECT id, start_time, end_time, start_latitude, start_longitude, end_latitude, end_longitude, distance_km
   FROM vehicle_trips
   WHERE vehicle_id = $1
     AND start_time >= TIMESTAMPTZ '2026-10-19 10:25:00+00'
     AND start_time <= TIMESTAMPTZ '2026-10-19 10:50:00+00'
   ORDER BY start_time`,
  [vid],
);
console.log(JSON.stringify({ tripCount: trips.rowCount, trips: trips.rows }, null, 2));
await client.end();
