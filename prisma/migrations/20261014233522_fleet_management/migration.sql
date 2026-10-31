-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('new', 'under_review', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "RuleFieldType" AS ENUM ('speed_kmh', 'latitude', 'longitude', 'last_seen_age_s', 'hour_of_day', 'day_of_week');

-- CreateEnum
CREATE TYPE "RuleOperator" AS ENUM ('gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'outside_hours', 'outside_days', 'enters_geofence', 'leaves_geofence');

-- CreateEnum
CREATE TYPE "RuleLogic" AS ENUM ('single', 'and_all', 'or_any');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app');

-- AlterTable
ALTER TABLE "ingest_sources" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "license_plate" TEXT,
ADD COLUMN     "vehicle_group" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "rules" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "logic" "RuleLogic" NOT NULL DEFAULT 'single',
    "severity" "Severity" NOT NULL DEFAULT 'warning',
    "version" INTEGER NOT NULL DEFAULT 1,
    "vehicle_group" TEXT,
    "vehicle_ids" UUID[],
    "threshold_value" DOUBLE PRECISION,
    "threshold_min" DOUBLE PRECISION,
    "threshold_max" DOUBLE PRECISION,
    "duration_sec" INTEGER,
    "consecutive_count" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Amsterdam',
    "weekdays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "time_from" TEXT,
    "time_to" TEXT,
    "geofence_id" UUID,
    "pre_event_points" INTEGER NOT NULL DEFAULT 10,
    "post_event_points" INTEGER NOT NULL DEFAULT 5,
    "retention_days" INTEGER NOT NULL DEFAULT 30,
    "notify_in_app" BOOLEAN NOT NULL DEFAULT true,
    "create_event" BOOLEAN NOT NULL DEFAULT true,
    "create_task" BOOLEAN NOT NULL DEFAULT false,
    "task_title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_conditions" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "field" "RuleFieldType" NOT NULL,
    "operator" "RuleOperator" NOT NULL,
    "value1" DOUBLE PRECISION,
    "value2" DOUBLE PRECISION,

    CONSTRAINT "rule_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'warning',
    "status" "EventStatus" NOT NULL DEFAULT 'new',
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "measured_value" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "duration_sec" INTEGER,
    "assigned_user_id" UUID,
    "review_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_points" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "speed_mps" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "sampled_at" TIMESTAMP(3) NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'during',

    CONSTRAINT "event_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofences" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "coordinates" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
    "due_date" TIMESTAMP(3),
    "vehicle_id" UUID,
    "event_id" UUID,
    "creator_id" UUID NOT NULL,
    "assignee_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'info',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "event_id" UUID,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" UUID NOT NULL,
    "org_key" TEXT NOT NULL DEFAULT 'default',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Amsterdam',
    "unit_speed" TEXT NOT NULL DEFAULT 'kmh',
    "telemetry_interval_s" INTEGER NOT NULL DEFAULT 15,
    "offline_threshold_s" INTEGER NOT NULL DEFAULT 120,
    "event_retention_days" INTEGER NOT NULL DEFAULT 30,
    "point_retention_days" INTEGER NOT NULL DEFAULT 90,
    "notify_in_app" BOOLEAN NOT NULL DEFAULT true,
    "org_name" TEXT NOT NULL DEFAULT 'Mijn Organisatie',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rules_enabled_idx" ON "rules"("enabled");

-- CreateIndex
CREATE INDEX "rule_conditions_rule_id_idx" ON "rule_conditions"("rule_id");

-- CreateIndex
CREATE INDEX "events_vehicle_id_start_time_idx" ON "events"("vehicle_id", "start_time");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "events_severity_idx" ON "events"("severity");

-- CreateIndex
CREATE INDEX "event_points_event_id_sampled_at_idx" ON "event_points"("event_id", "sampled_at");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_idx" ON "tasks"("assignee_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "settings_org_key_key" ON "settings"("org_key");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "ingest_sources_vehicle_group_idx" ON "ingest_sources"("vehicle_group");

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "geofences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_conditions" ADD CONSTRAINT "rule_conditions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "ingest_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_points" ADD CONSTRAINT "event_points_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "ingest_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
