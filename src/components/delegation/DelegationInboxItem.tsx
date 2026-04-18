"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

interface DelegationInboxItemProps {
  delegationId: string;
  taskTitle: string;
  delegatorName: string;
  note?: string | null;
  onAccept: (delegationId: string) => Promise<void>;
  onDecline: (delegationId: string, reason?: string) => Promise<void>;
}

export function DelegationInboxItem({
  delegationId,
  taskTitle,
  delegatorName,
  note,
  onAccept,
  onDecline,
}: DelegationInboxItemProps) {
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    try {
      await onAccept(delegationId);
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!showDeclineReason) {
      setShowDeclineReason(true);
      return;
    }
    setLoading(true);
    try {
      await onDecline(delegationId, declineReason.trim() || undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-lg">📨</span>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">
            Delegated by {delegatorName}
          </p>
          <p className="font-medium">{taskTitle}</p>
          {note && (
            <p className="text-sm text-muted-foreground mt-1 italic">
              &ldquo;{note}&rdquo;
            </p>
          )}
        </div>
      </div>

      {showDeclineReason && (
        <div>
          <Textarea
            placeholder="Reason for declining (optional)..."
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          onClick={handleAccept}
          disabled={loading}
        >
          Accept & Process
        </button>
        <button
          className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent disabled:opacity-50"
          onClick={handleDecline}
          disabled={loading}
        >
          {showDeclineReason ? "Confirm Decline" : "Decline"}
        </button>
        {showDeclineReason && (
          <button
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowDeclineReason(false)}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
