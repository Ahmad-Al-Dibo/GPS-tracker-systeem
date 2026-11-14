-- AlterTable
ALTER TABLE "ingest_points" ADD COLUMN     "record_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ingest_points_device_id_record_hash_key" ON "ingest_points"("device_id", "record_hash");
