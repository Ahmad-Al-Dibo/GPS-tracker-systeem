-- DropIndex
DROP INDEX "events_status_idx";

-- CreateIndex
CREATE INDEX "events_status_created_at_idx" ON "events"("status", "created_at");

-- CreateIndex
CREATE INDEX "ingest_points_received_at_idx" ON "ingest_points"("received_at");
