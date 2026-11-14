-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('HARDWARE', 'SOFTWARE');

-- AlterTable
ALTER TABLE "gps_devices" ADD COLUMN     "device_type" "DeviceType" NOT NULL DEFAULT 'HARDWARE',
ADD COLUMN     "owner_user_id" UUID,
ADD COLUMN     "simulator_id" TEXT,
ALTER COLUMN "imei" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "gps_devices_simulator_id_key" ON "gps_devices"("simulator_id");

-- CreateIndex
CREATE INDEX "gps_devices_owner_user_id_idx" ON "gps_devices"("owner_user_id");

-- AddForeignKey
ALTER TABLE "gps_devices" ADD CONSTRAINT "gps_devices_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
