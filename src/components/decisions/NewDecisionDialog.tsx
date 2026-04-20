"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MentionPicker } from "@/components/threads/MentionPicker";
import {
  Plus,
  X,
  Zap,
  ThumbsUp,
  CheckCircle,
  DollarSign,
  FileText,
  Calendar,
  Rocket,
  PenLine,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { DECISION_TEMPLATES, DecisionTemplate, DecisionTypeValue } from "./DecisionTemplates";

const ICON_MAP: Record<string, React.ElementType> = {
  Zap,
  ThumbsUp,
  CheckCircle,
  DollarSign,
  FileText,
  Calendar,
  Rocket,
};

interface NewDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    question: string;
    context?: string;
    respondentIds: string[];
    deadline?: string;
    decisionType?: DecisionTypeValue;
    options?: { label: string; description?: string }[];
    taskId?: string;
    wikiSlug?: string;
  }) => void;
  members: { id: string; name: string }[];
  currentUserId: string;
  tasks?: { id: string; title: string }[];
  wikiArticles?: { slug: string; title: string }[];
}

export function NewDecisionDialog({
  open,
  onOpenChange,
  onSubmit,
  members,
  currentUserId,
  tasks,
  wikiArticles,
}: NewDecisionDialogProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [respondentIds, setRespondentIds] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");
  const [decisionType, setDecisionType] = useState<DecisionTypeValue>("APPROVAL");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("__project__");
  const [selectedWikiSlug, setSelectedWikiSlug] = useState<string>("__none__");
  const [options, setOptions] = useState<{ label: string; description?: string }[]>([
    { label: "" },
    { label: "" },
  ]);

  function applyTemplate(template: DecisionTemplate) {
    setSelectedTemplateId(template.id);
    setDecisionType(template.decisionType);
    setQuestion(template.defaults.questionPrefix || "");
    setContext("");
    if (template.defaults.defaultOptions) {
      setOptions(template.defaults.defaultOptions.map((label) => ({ label })));
    } else {
      setOptions([{ label: "" }, { label: "" }]);
    }
  }

  function selectCustom() {
    setSelectedTemplateId("custom");
    setDecisionType("APPROVAL");
    setQuestion("");
    setContext("");
    setOptions([{ label: "" }, { label: "" }]);
  }

  function handleSubmit() {
    if (!question.trim() || respondentIds.length === 0) return;
    if (isPoll) {
      const validOpts = options.filter((o) => o.label.trim());
      if (validOpts.length < 2) return;
    }

    onSubmit({
      question: question.trim(),
      context: context.trim() || undefined,
      respondentIds,
      deadline: deadline ? new Date(deadline + "T23:59:59").toISOString() : undefined,
      decisionType,
      options: isPoll
        ? options.filter((o) => o.label.trim()).map((o) => ({
            label: o.label.trim(),
            description: o.description?.trim() || undefined,
          }))
        : undefined,
      taskId: selectedTaskId !== "__project__" ? selectedTaskId : undefined,
      wikiSlug: selectedWikiSlug !== "__none__" ? selectedWikiSlug : undefined,
    });
    resetForm();
  }

  function resetForm() {
    setSelectedTemplateId(null);
    setQuestion("");
    setContext("");
    setRespondentIds([]);
    setDeadline("");
    setDecisionType("APPROVAL");
    setSelectedTaskId("__project__");
    setSelectedWikiSlug("__none__");
    setOptions([{ label: "" }, { label: "" }]);
  }

  function addOption() {
    setOptions([...options, { label: "" }]);
  }

  function removeOption(index: number) {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== index));
  }

  function updateOption(index: number, label: string) {
    const updated = [...options];
    updated[index] = { ...updated[index], label };
    setOptions(updated);
  }

  const isPoll = decisionType === "POLL" || decisionType === "QUICK_POLL";
  const validOptions = options.filter((o) => o.label.trim());
  const canSubmit = question.trim() && respondentIds.length > 0 && (!isPoll || validOptions.length >= 2);

  const missingReason = useMemo(() => {
    if (!question.trim()) return "Add a question";
    if (isPoll && validOptions.length < 2) return "Add at least 2 options";
    if (respondentIds.length === 0) {
      const hasOtherMembers = members.some((m) => m.id !== currentUserId);
      return hasOtherMembers
        ? "Add a teammate to request votes from"
        : "Invite a teammate to this team to create decisions";
    }
    return null;
  }, [question, isPoll, validOptions.length, respondentIds.length, members, currentUserId]);

  const activeTemplate = selectedTemplateId && selectedTemplateId !== "custom"
    ? DECISION_TEMPLATES.find((t) => t.id === selectedTemplateId)
    : null;

  // Template selection view
  if (!selectedTemplateId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Decision</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            {DECISION_TEMPLATES.map((template) => {
              const IconComponent = ICON_MAP[template.icon];
              return (
                <Card
                  key={template.id}
                  className="p-3 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => applyTemplate(template)}
                >
                  <div className="flex items-start gap-2.5">
                    {IconComponent && (
                      <IconComponent className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-tight">{template.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {template.description}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
            <Card
              className="p-3 cursor-pointer hover:bg-accent transition-colors"
              onClick={selectCustom}
            >
              <div className="flex items-start gap-2.5">
                <PenLine className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">Custom</div>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    Start from scratch with a blank form.
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Form view (after template selection)
  const titleLabel = decisionType === "PROPOSAL"
    ? "Create Proposal"
    : decisionType === "QUICK_POLL"
      ? "Create Quick Poll"
      : decisionType === "POLL"
        ? "Create Poll"
        : "Request Decision";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titleLabel}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template badge + change link */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {activeTemplate && (
                <>
                  {ICON_MAP[activeTemplate.icon] &&
                    (() => {
                      const Icon = ICON_MAP[activeTemplate.icon];
                      return <Icon className="h-3.5 w-3.5" />;
                    })()}
                  <span>Template: {activeTemplate.name}</span>
                </>
              )}
              {selectedTemplateId === "custom" && (
                <span>Custom decision</span>
              )}
            </div>
            <button
              onClick={() => { resetForm(); }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Change template
            </button>
          </div>

          {/* Type toggle */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setDecisionType("APPROVAL")}
              className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${
                decisionType === "APPROVAL" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Decision
            </button>
            <button
              onClick={() => setDecisionType("POLL")}
              className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${
                decisionType === "POLL" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Poll
            </button>
            <button
              onClick={() => setDecisionType("QUICK_POLL")}
              className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${
                decisionType === "QUICK_POLL" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Quick Poll
            </button>
            <button
              onClick={() => setDecisionType("PROPOSAL")}
              className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${
                decisionType === "PROPOSAL" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Proposal
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {isPoll ? "Poll Question" : decisionType === "PROPOSAL" ? "Proposal Title" : "Question"}
            </label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                isPoll
                  ? "What should we vote on?"
                  : decisionType === "PROPOSAL"
                    ? "What decision needs to be made?"
                    : "What needs to be decided?"
              }
              className="text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Context {decisionType === "PROPOSAL" ? "" : "(optional)"}
            </label>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder={activeTemplate?.defaults.contextHint || "Background, options, constraints..."}
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Poll options */}
          {isPoll && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Options (min 2)
              </label>
              <div className="space-y-2">
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={option.label}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      className="text-sm"
                    />
                    {options.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={() => removeOption(index)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addOption}
                  className="text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add option
                </Button>
              </div>
            </div>
          )}

          {tasks && tasks.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Anchor to task (optional)
              </label>
              <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__project__">Project-level</SelectItem>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <MentionPicker
            members={members}
            selected={respondentIds}
            onChange={setRespondentIds}
            currentUserId={currentUserId}
          />

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Deadline (optional)
            </label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="text-sm w-48"
            />
          </div>

          {wikiArticles && wikiArticles.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Record outcome in wiki (optional)
              </label>
              <Select value={selectedWikiSlug} onValueChange={setSelectedWikiSlug}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {wikiArticles.map((a) => (
                    <SelectItem key={a.slug} value={a.slug}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="sm:items-center gap-2">
          {missingReason && (
            <span className="text-muted-foreground text-sm mr-auto">
              {missingReason}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {decisionType === "PROPOSAL"
              ? "Create Proposal"
              : isPoll
                ? decisionType === "QUICK_POLL"
                  ? "Create Quick Poll"
                  : "Create Poll"
                : "Request Decision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
