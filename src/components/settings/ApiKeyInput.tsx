"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Key, Eye, EyeOff, Check, AlertTriangle } from "lucide-react";

interface ApiKeyInputProps {
  hasApiKey: boolean;
  hasServerKey: boolean;
  apiKeyPreview: string | null;
  aiEnabled: boolean;
  onSaveKey: (key: string) => Promise<void>;
  onClearKey: () => Promise<void>;
}

export function ApiKeyInput({
  hasApiKey,
  hasServerKey,
  apiKeyPreview,
  aiEnabled,
  onSaveKey,
  onClearKey,
}: ApiKeyInputProps) {
  const [keyValue, setKeyValue] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);

  const handleSave = async () => {
    if (!keyValue.trim()) return;
    setSaving(true);
    try {
      await onSaveKey(keyValue.trim());
      setKeyValue("");
      setShowKey(false);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await onClearKey();
      setKeyValue("");
    } finally {
      setClearing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="api-key" className="flex items-center gap-2">
        <Key className="h-4 w-4" />
        API Key
      </Label>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="api-key"
            type={showKey ? "text" : "password"}
            placeholder={
              hasApiKey
                ? apiKeyPreview ?? "Key saved (encrypted)"
                : "sk-ant-api03-..."
            }
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!aiEnabled}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {showKey ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <Button
          onClick={handleSave}
          disabled={!keyValue.trim() || saving || !aiEnabled}
          size="sm"
          className="shrink-0"
        >
          {saving ? "Saving..." : "Save"}
        </Button>
        {hasApiKey && (
          <Button
            onClick={handleClear}
            disabled={clearing || !aiEnabled}
            variant="outline"
            size="sm"
            className="shrink-0"
          >
            {clearing ? "Clearing..." : "Clear"}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Your personal Anthropic API key. Takes priority over the server key if
        one is configured.
      </p>

      {/* Status indicator */}
      <div className="flex items-center gap-2">
        {hasApiKey ? (
          <Badge variant="default" className="gap-1">
            <Check className="h-3 w-3" />
            Using your personal key
          </Badge>
        ) : hasServerKey ? (
          <Badge variant="secondary" className="gap-1">
            <Check className="h-3 w-3" />
            Using server key
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            No API key configured
          </Badge>
        )}
      </div>
    </div>
  );
}
