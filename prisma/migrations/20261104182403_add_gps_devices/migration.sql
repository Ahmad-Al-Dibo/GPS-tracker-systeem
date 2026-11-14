-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('pending', 'active', 'revoked');

-- AlterTable
ALTER TABLE "ingest_points" ADD COLUMN     "altitude" DOUBLE PRECISION,
ADD COLUMN     "device_id" UUID,
ADD COLUMN     "heading" DOUBLE PRECISION,
ADD COLUMN     "io_data" JSONB,
ADD COLUMN     "priority" INTEGER,
ADD COLUMN     "satellites" INTEGER;

-- CreateTable
CREATE TABLE "gps_devices" (
    "id" UUID NOT NULL,
    "imei" TEXT NOT NULL,
    "label" TEXT,
    "brand" TEXT DEFAULT 'Teltonika',
    "model" TEXT,
    "sim_card_number" TEXT,
    "firmware" TEXT,
    "protocol" TEXT DEFAULT 'codec8e',
    "status" "DeviceStatus" NOT NULL DEFAULT 'pending',
    "authorized_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "vehicle_id" UUID,
    "assigned_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "last_lat" DOUBLE PRECISION,
    "last_lon" DOUBLE PRECISION,
    "last_speed_mps" DOUBLE PRECISION,
    "last_fix_at" TIMESTAMP(3),
    "last_record_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "gps_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gps_devices_imei_key" ON "gps_devices"("imei");

-- CreateIndex
CREATE INDEX "gps_devices_vehicle_id_idx" ON "gps_devices"("vehicle_id");

-- CreateIndex
CREATE INDEX "gps_devices_status_idx" ON "gps_devices"("status");

-- CreateIndex
CREATE INDEX "gps_devices_last_seen_at_idx" ON "gps_devices"("last_seen_at");

-- CreateIndex
CREATE INDEX "ingest_points_device_id_sampled_at_idx" ON "ingest_points"("device_id", "sampled_at");

-- AddForeignKey
ALTER TABLE "ingest_points" ADD CONSTRAINT "ingest_points_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "gps_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_devices" ADD CONSTRAINT "gps_devices_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "ingest_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
