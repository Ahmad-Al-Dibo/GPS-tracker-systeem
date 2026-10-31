-- AlterTable
ALTER TABLE "ingest_sources" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "chassis_number" TEXT,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "current_km" DOUBLE PRECISION,
ADD COLUMN     "last_calc_at" TIMESTAMP(3),
ADD COLUMN     "last_calc_lat" DOUBLE PRECISION,
ADD COLUMN     "last_calc_lon" DOUBLE PRECISION,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "sim_card_number" TEXT,
ADD COLUMN     "starting_km" DOUBLE PRECISION,
ADD COLUMN     "total_distance_km" DOUBLE PRECISION,
ADD COLUMN     "tracker_brand" TEXT,
ADD COLUMN     "tracker_serial" TEXT,
ADD COLUMN     "tracker_source" TEXT DEFAULT 'app',
ADD COLUMN     "tracker_type" TEXT,
ADD COLUMN     "vehicle_type" TEXT,
ADD COLUMN     "year_of_build" INTEGER;

-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "country" TEXT,
    "zipcode" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_persons" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_persons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_persons_vehicle_id_person_id_key" ON "vehicle_persons"("vehicle_id", "person_id");

-- CreateIndex
CREATE INDEX "ingest_sources_license_plate_idx" ON "ingest_sources"("license_plate");

-- CreateIndex
CREATE INDEX "ingest_sources_tracker_serial_idx" ON "ingest_sources"("tracker_serial");

-- AddForeignKey
ALTER TABLE "vehicle_persons" ADD CONSTRAINT "vehicle_persons_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "ingest_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_persons" ADD CONSTRAINT "vehicle_persons_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
