-- CreateTable: ThreadReaction
CREATE TABLE "ThreadReaction" (
    "id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ThreadReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThreadReaction_messageId_idx" ON "ThreadReaction"("messageId");

-- CreateIndex (unique: one reaction per emoji per user per message)
CREATE UNIQUE INDEX "ThreadReaction_messageId_userId_emoji_key" ON "ThreadReaction"("messageId", "userId", "emoji");

-- AddForeignKey
ALTER TABLE "ThreadReaction" ADD CONSTRAINT "ThreadReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ThreadMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadReaction" ADD CONSTRAINT "ThreadReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
