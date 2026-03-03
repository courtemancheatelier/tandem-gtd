"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Lightbulb, BookOpen, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NotActionableData {
  disposition: "trash" | "someday" | "reference";
  somedayTitle?: string;
  referenceTitle?: string;
  referenceContent?: string;
}

interface ProcessingStep2aProps {
  inboxContent: string;
  inboxNotes: string | null;
  onBack: () => void;
  onConfirm: (data: NotActionableData) => void;
}

export function ProcessingStep2a({
  inboxContent,
  inboxNotes,
  onBack,
  onConfirm,
}: ProcessingStep2aProps) {
  const [disposition, setDisposition] = useState<
    "trash" | "someday" | "reference" | null
  >(null);
  const [somedayTitle, setSomedayTitle] = useState(inboxContent);
  const [referenceTitle, setReferenceTitle] = useState(inboxContent);
  const [referenceContent, setReferenceContent] = useState(
    inboxNotes || inboxContent
  );

  const options = [
    {
      key: "trash" as const,
      icon: Trash2,
      title: "Trash",
      description: "Delete it -- not needed",
      color: "text-destructive",
    },
    {
      key: "someday" as const,
      icon: Lightbulb,
      title: "Someday / Maybe",
      description: "Save for later consideration",
      color: "text-yellow-500",
    },
    {
      key: "reference" as const,
      icon: BookOpen,
      title: "Reference",
      description: "Add to wiki for future lookup",
      color: "text-blue-500",
    },
  ];

  function handleConfirm() {
    if (!disposition) return;
    const data: NotActionableData = { disposition };
    if (disposition === "someday") {
      data.somedayTitle = somedayTitle;
    }
    if (disposition === "reference") {
      data.referenceTitle = referenceTitle;
      data.referenceContent = referenceContent;
    }
    onConfirm(data);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h2 className="text-lg font-semibold">Not Actionable</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        What would you like to do with this item?
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((opt) => (
          <Card
            key={opt.key}
            className={cn(
              "cursor-pointer transition-colors hover:bg-accent/50",
              disposition === opt.key && "ring-2 ring-primary bg-accent/30"
            )}
            onClick={() => setDisposition(opt.key)}
          >
            <CardContent className="py-4 px-4 text-center">
              <opt.icon className={cn("h-8 w-8 mx-auto mb-2", opt.color)} />
              <p className="font-medium text-sm">{opt.title}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {opt.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {disposition === "someday" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Someday/Maybe Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="someday-title">Title</Label>
              <Input
                id="someday-title"
                value={somedayTitle}
                onChange={(e) => setSomedayTitle(e.target.value)}
                placeholder="Someday/maybe title"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {disposition === "reference" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Reference Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="ref-title">Title</Label>
              <Input
                id="ref-title"
                value={referenceTitle}
                onChange={(e) => setReferenceTitle(e.target.value)}
                placeholder="Article title"
              />
            </div>
            <div>
              <Label htmlFor="ref-content">Content</Label>
              <Textarea
                id="ref-content"
                value={referenceContent}
                onChange={(e) => setReferenceContent(e.target.value)}
                placeholder="Reference content..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={handleConfirm} disabled={!disposition}>
          Continue
        </Button>
      </div>
    </div>
  );
}
