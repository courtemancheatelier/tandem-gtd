"use client";

import { ThreadList } from "@/components/threads/ThreadList";

interface ProjectThreadsTabProps {
  projectId: string;
  currentUserId: string;
  members: { id: string; name: string }[];
}

export function ProjectThreadsTab({ projectId, currentUserId, members }: ProjectThreadsTabProps) {
  return (
    <div className="rounded-lg border p-4">
      <ThreadList
        projectId={projectId}
        currentUserId={currentUserId}
        members={members}
      />
    </div>
  );
}
