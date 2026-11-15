-- Laatst bekende apparaatwaarden op het tracker-profiel (Phase 2).
-- Per-point historie blijft in ingest_points; dit is de "latest"-status.
ALTER TABLE "ingest_sources" ADD COLUMN "last_altitude" DOUBLE PRECISION;
ALTER TABLE "ingest_sources" ADD COLUMN "last_heading" DOUBLE PRECISION;
ALTER TABLE "ingest_sources" ADD COLUMN "last_battery_level" INTEGER;
