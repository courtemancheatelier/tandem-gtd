"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface User {
  id: string;
  name: string;
  email: string;
}

interface DelegationPickerProps {
  onSelect: (data: {
    delegateeId: string;
    delegateeName: string;
    landingZone: "INBOX" | "DO_NOW";
    note?: string;
  }) => void;
  onCancel: () => void;
}

export function DelegationPicker({ onSelect, onCancel }: DelegationPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [landingZone, setLandingZone] = useState<"INBOX" | "DO_NOW">("INBOX");
  const [note, setNote] = useState("");
  const [searching, setSearching] = useState(false);

  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchUsers(query), 300);
    return () => clearTimeout(timer);
  }, [query, searchUsers]);

  const handleConfirm = () => {
    if (!selectedUser) return;
    onSelect({
      delegateeId: selectedUser.id,
      delegateeName: selectedUser.name,
      landingZone,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4">
      {!selectedUser ? (
        <div>
          <Label>Delegate to</Label>
          <Input
            placeholder="Search team members..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {searching && (
            <p className="text-sm text-muted-foreground mt-1">Searching...</p>
          )}
          {results.length > 0 && (
            <div className="mt-1 border rounded-md max-h-48 overflow-y-auto">
              {results.map((user) => (
                <button
                  key={user.id}
                  className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2"
                  onClick={() => {
                    setSelectedUser(user);
                    setResults([]);
                    setQuery("");
                  }}
                >
                  <span className="text-sm">👤</span>
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </button>
              ))}
            </div>
          )}
          {query.length > 0 && results.length === 0 && !searching && (
            <p className="text-sm text-muted-foreground mt-1">
              No team members found
            </p>
          )}
        </div>
      ) : (
        <>
          <div>
            <Label>Delegating to</Label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm">👤 {selectedUser.name}</span>
              <button
                className="text-xs text-muted-foreground underline"
                onClick={() => setSelectedUser(null)}
              >
                Change
              </button>
            </div>
          </div>

          <div>
            <Label>Landing zone</Label>
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="landingZone"
                  checked={landingZone === "INBOX"}
                  onChange={() => setLandingZone("INBOX")}
                />
                Inbox (they&apos;ll clarify and route it)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="landingZone"
                  checked={landingZone === "DO_NOW"}
                  onChange={() => setLandingZone("DO_NOW")}
                />
                Do Now (surface immediately)
              </label>
            </div>
          </div>

          <div>
            <Label>Note (optional)</Label>
            <Textarea
              placeholder="Add context for the recipient..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleConfirm}
            >
              Delegate
            </button>
          </div>
        </>
      )}
    </div>
  );
}
