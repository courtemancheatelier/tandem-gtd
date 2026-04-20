-- CreateTable
CREATE TABLE "task_timer_sessions" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "paused_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_min" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_timer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_timer_sessions_task_id_idx" ON "task_timer_sessions"("task_id");

-- CreateIndex
CREATE INDEX "task_timer_sessions_user_id_is_active_idx" ON "task_timer_sessions"("user_id", "is_active");

-- AddForeignKey
ALTER TABLE "task_timer_sessions" ADD CONSTRAINT "task_timer_sessions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_timer_sessions" ADD CONSTRAINT "task_timer_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
