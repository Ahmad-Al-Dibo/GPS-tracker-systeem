-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('permanent', 'temporary');

-- CreateTable
CREATE TABLE "managed_locations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geocode_provider" TEXT,
    "geocode_label" TEXT,
    "type" "LocationType" NOT NULL DEFAULT 'permanent',
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "notes" TEXT,
    "color" TEXT,
    "created_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "managed_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_points" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,
    "location_id" UUID,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "route_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "managed_locations_type_expires_at_idx" ON "managed_locations"("type", "expires_at");

-- CreateIndex
CREATE INDEX "managed_locations_deleted_at_idx" ON "managed_locations"("deleted_at");

-- CreateIndex
CREATE INDEX "routes_deleted_at_idx" ON "routes"("deleted_at");

-- CreateIndex
CREATE INDEX "route_points_route_id_idx" ON "route_points"("route_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_points_route_id_order_index_key" ON "route_points"("route_id", "order_index");

-- AddForeignKey
ALTER TABLE "managed_locations" ADD CONSTRAINT "managed_locations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_points" ADD CONSTRAINT "route_points_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_points" ADD CONSTRAINT "route_points_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "managed_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
