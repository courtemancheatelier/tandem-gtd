"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, HelpCircle } from "lucide-react";

interface RSVPConfirmationProps {
  event: {
    title: string;
    eventDate: string;
    projectTitle: string;
  };
  attendance: "YES" | "NO" | "MAYBE";
}

export function RSVPConfirmation({ event, attendance }: RSVPConfirmationProps) {
  const icon =
    attendance === "YES" ? (
      <Check className="h-12 w-12 text-green-500" />
    ) : attendance === "NO" ? (
      <X className="h-12 w-12 text-red-500" />
    ) : (
      <HelpCircle className="h-12 w-12 text-yellow-500" />
    );

  const message =
    attendance === "YES"
      ? "You're going!"
      : attendance === "NO"
      ? "You've declined."
      : "You've responded maybe.";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center">{icon}</div>
          <CardTitle>{message}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="font-medium">{event.title}</p>
          <p className="text-sm text-muted-foreground">
            {new Date(event.eventDate).toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="pt-4 text-xs text-muted-foreground">
            You can revisit this link to update your response.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
