-- Add team ownership and global visibility to ProjectTemplate
ALTER TABLE "ProjectTemplate" ADD COLUMN "teamId" TEXT;
ALTER TABLE "ProjectTemplate" ADD COLUMN "isGloballyHidden" BOOLEAN NOT NULL DEFAULT false;

-- Create HiddenTemplate table for per-user template hiding
CREATE TABLE "HiddenTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenTemplate_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "ProjectTemplate_teamId_idx" ON "ProjectTemplate"("teamId");
CREATE INDEX "HiddenTemplate_userId_idx" ON "HiddenTemplate"("userId");
CREATE UNIQUE INDEX "HiddenTemplate_userId_templateId_key" ON "HiddenTemplate"("userId", "templateId");

-- Foreign keys
ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HiddenTemplate" ADD CONSTRAINT "HiddenTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiddenTemplate" ADD CONSTRAINT "HiddenTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
