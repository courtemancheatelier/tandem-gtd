-- CreateEnum
CREATE TYPE "ThreadPurpose" AS ENUM ('QUESTION', 'BLOCKER', 'UPDATE', 'FYI');

-- AlterEnum (TaskEventType)
ALTER TYPE "TaskEventType" ADD VALUE 'THREAD_OPENED';
ALTER TYPE "TaskEventType" ADD VALUE 'THREAD_RESOLVED';

-- AlterEnum (ProjectEventType)
ALTER TYPE "ProjectEventType" ADD VALUE 'THREAD_OPENED';
ALTER TYPE "ProjectEventType" ADD VALUE 'THREAD_RESOLVED';

-- AlterTable: WaitingFor — add threadId
ALTER TABLE "WaitingFor" ADD COLUMN "thread_id" TEXT;

-- CreateTable: Thread
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "purpose" "ThreadPurpose" NOT NULL,
    "title" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "taskId" TEXT,
    "projectId" TEXT,
    "created_by_id" TEXT NOT NULL,
    "resolved_by_id" TEXT,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ThreadMessage
CREATE TABLE "ThreadMessage" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "ThreadMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ThreadMention
CREATE TABLE "ThreadMention" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ThreadMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Thread_taskId_idx" ON "Thread"("taskId");
CREATE INDEX "Thread_projectId_idx" ON "Thread"("projectId");
CREATE INDEX "Thread_created_by_id_idx" ON "Thread"("created_by_id");
CREATE INDEX "Thread_isResolved_idx" ON "Thread"("isResolved");

CREATE INDEX "ThreadMessage_threadId_createdAt_idx" ON "ThreadMessage"("threadId", "createdAt");
CREATE INDEX "ThreadMessage_authorId_idx" ON "ThreadMessage"("authorId");

CREATE UNIQUE INDEX "ThreadMention_messageId_userId_key" ON "ThreadMention"("messageId", "userId");
CREATE INDEX "ThreadMention_threadId_idx" ON "ThreadMention"("threadId");
CREATE INDEX "ThreadMention_userId_idx" ON "ThreadMention"("userId");

CREATE INDEX "WaitingFor_thread_id_idx" ON "WaitingFor"("thread_id");

-- AddForeignKey
ALTER TABLE "WaitingFor" ADD CONSTRAINT "WaitingFor_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "Thread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Thread" ADD CONSTRAINT "Thread_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ThreadMessage" ADD CONSTRAINT "ThreadMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadMessage" ADD CONSTRAINT "ThreadMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ThreadMention" ADD CONSTRAINT "ThreadMention_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadMention" ADD CONSTRAINT "ThreadMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ThreadMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadMention" ADD CONSTRAINT "ThreadMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
