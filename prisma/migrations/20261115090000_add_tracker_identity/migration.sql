-- Phase 2: uniforme tracker-identiteit op ingest_sources (additief).
-- externalId = stabiele identiteit (IMEI / install-UUID); naam is nooit identiteit.
ALTER TABLE "ingest_sources" ADD COLUMN "external_id" TEXT;
ALTER TABLE "ingest_sources" ADD COLUMN "source_type" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "ingest_sources" ADD COLUMN "metadata" JSONB;
ALTER TABLE "ingest_sources" ADD COLUMN "device_metadata" JSONB;
ALTER TABLE "ingest_sources" ADD COLUMN "verification_status" TEXT NOT NULL DEFAULT 'verified';
ALTER TABLE "ingest_sources" ADD COLUMN "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ingest_sources" ADD COLUMN "device_secret_hash" TEXT;

-- Backfill bestaande records: allemaal handmatig aangemaakt vóór
-- auto-registratie → verified; firstSeen = aanmaakmoment; bron afleiden uit
-- de oude tracker_source-indeling ("physical" → hardware, "app" → mobile).
UPDATE "ingest_sources" SET "first_seen_at" = "created_at";
UPDATE "ingest_sources" SET "source_type" = CASE WHEN "tracker_source" = 'physical' THEN 'hardware' ELSE 'mobile' END;

-- Unieke identiteit + enrolment-credential (meerdere NULL's toegestaan)
CREATE UNIQUE INDEX "ingest_sources_external_id_key" ON "ingest_sources"("external_id");
CREATE UNIQUE INDEX "ingest_sources_device_secret_hash_key" ON "ingest_sources"("device_secret_hash");
CREATE INDEX "ingest_sources_source_type_verification_status_idx" ON "ingest_sources"("source_type", "verification_status");

-- Settings: configureerbare download-URL voor de mobiele app (leeg = geen link)
ALTER TABLE "settings" ADD COLUMN "app_download_url" TEXT;
