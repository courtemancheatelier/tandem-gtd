-- Add external link fields to Task and Project

ALTER TABLE "Task" ADD COLUMN "external_link_url" TEXT;
ALTER TABLE "Task" ADD COLUMN "external_link_label" TEXT;

ALTER TABLE "Project" ADD COLUMN "external_link_url" TEXT;
ALTER TABLE "Project" ADD COLUMN "external_link_label" TEXT;
