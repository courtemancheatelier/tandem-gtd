"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Trash2,
  Lightbulb,
  BookOpen,
  FolderOpen,
  Tag,
  Zap,
  Clock,
  User,
  Loader2,
} from "lucide-react";
import type { NotActionableData } from "./ProcessingStep2a";
import type { ActionableData } from "./ProcessingStep2b";

interface ProcessingStep3Props {
  inboxContent: string;
  decision: "actionable" | "not_actionable";
  notActionableData?: NotActionableData;
  actionableData?: ActionableData;
  onBack: () => void;
  onProcess: () => void;
  processing: boolean;
  totalItems: number;
  processedCount: number;
}

export function ProcessingStep3({
  inboxContent,
  decision,
  notActionableData,
  actionableData,
  onBack,
  onProcess,
  processing,
  totalItems,
  processedCount,
}: ProcessingStep3Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={processing}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h2 className="text-lg font-semibold">Confirm & Process</h2>
      </div>

      {/* Original Item */}
      <Card className="bg-muted/30">
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
            Original inbox item
          </p>
          <p className="text-sm">{inboxContent}</p>
        </CardContent>
      </Card>

      <Separator />

      {/* Decision Summary */}
      {decision === "not_actionable" && notActionableData && (
        <NotActionableSummary data={notActionableData} />
      )}

      {decision === "actionable" && actionableData && (
        <ActionableSummary data={actionableData} />
      )}

      <Separator />

      {/* Progress + Action */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {processedCount + 1} of {totalItems} items
        </p>
        <Button onClick={onProcess} disabled={processing} size="lg">
          {processing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          {processing ? "Processing..." : "Process & Next"}
        </Button>
      </div>
    </div>
  );
}

function NotActionableSummary({ data }: { data: NotActionableData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          What will happen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.disposition === "trash" && (
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <span className="text-sm">Item will be deleted</span>
          </div>
        )}
        {data.disposition === "someday" && (
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            <span className="text-sm">
              Create Someday/Maybe project: <strong>{data.somedayTitle}</strong>
            </span>
          </div>
        )}
        {data.disposition === "reference" && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-500" />
              <span className="text-sm">
                Create wiki article: <strong>{data.referenceTitle}</strong>
              </span>
            </div>
            {data.referenceContent && (
              <p className="text-xs text-muted-foreground ml-6 line-clamp-2">
                {data.referenceContent}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionableSummary({ data }: { data: ActionableData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          What will be created
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Task */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            <span className="text-sm">
              {data.twoMinuteTask ? "Completed task" : "New task"}:{" "}
              <strong>{data.taskTitle}</strong>
            </span>
          </div>

          {data.twoMinuteTask && (
            <Badge className="ml-6" variant="secondary">
              <Zap className="h-3 w-3 mr-1" />
              2-minute task (done!)
            </Badge>
          )}

          {/* Details */}
          <div className="ml-6 flex flex-wrap gap-2">
            {data.newProjectTitle && (
              <Badge variant="outline">
                <FolderOpen className="h-3 w-3 mr-1" />
                New project: {data.newProjectTitle}
              </Badge>
            )}
            {data.projectId && (
              <Badge variant="outline">
                <FolderOpen className="h-3 w-3 mr-1" />
                In project
              </Badge>
            )}
            {data.contextId && (
              <Badge variant="outline">
                <Tag className="h-3 w-3 mr-1" />
                Context assigned
              </Badge>
            )}
            {data.energyLevel && (
              <Badge variant="outline">
                <Zap className="h-3 w-3 mr-1" />
                {data.energyLevel.charAt(0) + data.energyLevel.slice(1).toLowerCase()} energy
              </Badge>
            )}
            {data.estimatedMins && (
              <Badge variant="outline">
                <Clock className="h-3 w-3 mr-1" />
                {data.estimatedMins} min
              </Badge>
            )}
            {data.scheduledDate && (
              <Badge variant="outline">
                Deferred to {new Date(data.scheduledDate).toLocaleDateString()}
              </Badge>
            )}
            {data.dueDate && (
              <Badge variant="outline">
                Due {new Date(data.dueDate).toLocaleDateString()}
              </Badge>
            )}
          </div>

          {/* Delegation */}
          {data.delegateTo && (
            <div className="flex items-center gap-2 ml-6">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Delegated to <strong>{data.delegateTo}</strong> (waiting-for record)
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
