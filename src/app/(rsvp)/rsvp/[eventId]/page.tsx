"use client";

import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { RSVPFormByEvent } from "@/components/events/RSVPFormByEvent";

export default function RSVPByEventPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { data: session } = useSession();

  if (!session?.user?.email) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return <RSVPFormByEvent eventId={eventId} userEmail={session.user.email} />;
}
