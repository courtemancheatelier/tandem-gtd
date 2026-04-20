-- CreateEnum
CREATE TYPE "EventFieldType" AS ENUM ('ATTENDANCE', 'HEADCOUNT', 'SINGLE_SELECT', 'MULTI_SELECT', 'CLAIM', 'TEXT', 'TOGGLE');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('YES', 'NO', 'MAYBE');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "lock_date" TIMESTAMP(3),
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "project_id" TEXT NOT NULL,
    "team_id" TEXT,
    "owner_id" TEXT NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventField" (
    "id" TEXT NOT NULL,
    "type" "EventFieldType" NOT NULL,
    "label" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_org_only" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB,
    "event_id" TEXT NOT NULL,

    CONSTRAINT "EventField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "event_id" TEXT NOT NULL,
    "user_id" TEXT,

    CONSTRAINT "EventInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventResponse" (
    "id" TEXT NOT NULL,
    "attendance" "AttendanceStatus" NOT NULL,
    "field_values" JSONB NOT NULL DEFAULT '{}',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "EventResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTrigger" (
    "id" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "task_title" TEXT NOT NULL,
    "fired" BOOLEAN NOT NULL DEFAULT false,
    "fired_at" TIMESTAMP(3),
    "event_id" TEXT NOT NULL,
    "assignee_id" TEXT,

    CONSTRAINT "EventTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimLock" (
    "id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "option_key" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "ClaimLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_owner_id_idx" ON "Event"("owner_id");
CREATE INDEX "Event_team_id_idx" ON "Event"("team_id");
CREATE INDEX "Event_event_date_idx" ON "Event"("event_date");
CREATE UNIQUE INDEX "Event_project_id_key" ON "Event"("project_id");

-- CreateIndex
CREATE INDEX "EventField_event_id_idx" ON "EventField"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "EventInvitation_token_key" ON "EventInvitation"("token");
CREATE INDEX "EventInvitation_event_id_idx" ON "EventInvitation"("event_id");
CREATE INDEX "EventInvitation_email_idx" ON "EventInvitation"("email");
CREATE INDEX "EventInvitation_token_idx" ON "EventInvitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "EventResponse_event_id_user_id_key" ON "EventResponse"("event_id", "user_id");
CREATE INDEX "EventResponse_event_id_idx" ON "EventResponse"("event_id");

-- CreateIndex
CREATE INDEX "EventTrigger_event_id_idx" ON "EventTrigger"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimLock_field_id_option_key_key" ON "ClaimLock"("field_id", "option_key");
CREATE INDEX "ClaimLock_event_id_idx" ON "ClaimLock"("event_id");
CREATE INDEX "ClaimLock_expires_at_idx" ON "ClaimLock"("expires_at");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventField" ADD CONSTRAINT "EventField_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInvitation" ADD CONSTRAINT "EventInvitation_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventInvitation" ADD CONSTRAINT "EventInvitation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventResponse" ADD CONSTRAINT "EventResponse_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventResponse" ADD CONSTRAINT "EventResponse_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTrigger" ADD CONSTRAINT "EventTrigger_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTrigger" ADD CONSTRAINT "EventTrigger_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLock" ADD CONSTRAINT "ClaimLock_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimLock" ADD CONSTRAINT "ClaimLock_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
