-- Stations V2 Prompt 24: coordinate provenance (source + confirmedAt) for master data.

CREATE TYPE "station_coordinates_source" AS ENUM ('MANUAL', 'FORWARD_GEOCODE', 'MAPBOX_RETRIEVE');

ALTER TABLE "stations"
  ADD COLUMN "coordinates_source" "station_coordinates_source",
  ADD COLUMN "coordinates_confirmed_at" TIMESTAMP(3);
