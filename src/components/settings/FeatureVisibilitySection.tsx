"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Eye } from "lucide-react";

interface FeatureItem {
  key: string;
  label: string;
  description: string;
  adminState: "on" | "off" | "default_off";
  userEnabled: boolean | null;
  visible: boolean;
}

export function FeatureVisibilitySection() {
  const { toast } = useToast();
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchFeatures = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/features");
      if (res.ok) {
        const data = await res.json();
        setFeatures(data.features);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  async function toggleFeature(key: string, wantVisible: boolean) {
    // Build preferences map from current state
    const prefs: Record<string, boolean> = {};
    for (const f of features) {
      if (f.userEnabled !== null) prefs[f.key] = f.userEnabled;
    }
    prefs[key] = wantVisible;

    // Optimistic update
    setFeatures((prev) =>
      prev.map((f) => {
        if (f.key !== key) return f;
        const newVisible =
          f.adminState === "off"
            ? false
            : f.adminState === "default_off"
              ? wantVisible
              : wantVisible;
        return { ...f, userEnabled: wantVisible, visible: newVisible };
      })
    );

    setSaving(true);
    try {
      const res = await fetch("/api/settings/features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: prefs }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch {
      toast({ title: "Error", description: "Failed to save feature preferences", variant: "destructive" });
      fetchFeatures();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading features...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Eye className="h-5 w-5" />
          Feature Visibility
        </CardTitle>
        <CardDescription>
          Show or hide optional features to customize your navigation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {features.map((f) => {
            const isOff = f.adminState === "off";
            const isDefaultOff = f.adminState === "default_off";
            const isChecked = f.visible;

            return (
              <div
                key={f.key}
                className={`flex items-center justify-between py-2 px-3 rounded-md ${
                  isOff ? "opacity-50 bg-muted" : ""
                }`}
              >
                <div>
                  <span className="text-sm font-medium">{f.label}</span>
                  <p className="text-xs text-muted-foreground">{f.description}</p>
                  {isOff && (
                    <p className="text-xs text-destructive mt-0.5">Disabled by admin</p>
                  )}
                  {isDefaultOff && !isChecked && (
                    <p className="text-xs text-muted-foreground mt-0.5">Off by default — toggle on to enable</p>
                  )}
                </div>
                <Switch
                  checked={isChecked}
                  disabled={saving || isOff}
                  onCheckedChange={(checked) => toggleFeature(f.key, checked)}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
