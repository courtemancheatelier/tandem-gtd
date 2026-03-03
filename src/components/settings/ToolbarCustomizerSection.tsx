"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Smartphone, Plus, Minus, ArrowUp, ArrowDown, MoreHorizontal } from "lucide-react";
import {
  AVAILABLE_TOOLBAR_ITEMS,
  MAX_TOOLBAR_ITEMS,
  getToolbarConfig,
  saveToolbarConfig,
  resolveToolbarItems,
} from "@/components/layout/bottom-toolbar-config";
import type { ToolbarItem } from "@/components/layout/bottom-toolbar-config";

export function ToolbarCustomizerSection() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedIds(getToolbarConfig());
  }, []);

  function persist(ids: string[]) {
    setSelectedIds(ids);
    saveToolbarConfig(ids);
  }

  function addItem(id: string) {
    if (selectedIds.length >= MAX_TOOLBAR_ITEMS) return;
    if (selectedIds.includes(id)) return;
    persist([...selectedIds, id]);
  }

  function removeItem(id: string) {
    persist(selectedIds.filter((i) => i !== id));
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    const next = [...selectedIds];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    persist(next);
  }

  function moveDown(index: number) {
    if (index >= selectedIds.length - 1) return;
    const next = [...selectedIds];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    persist(next);
  }

  const currentItems = resolveToolbarItems(selectedIds);
  const availableItems = AVAILABLE_TOOLBAR_ITEMS.filter(
    (item) => !selectedIds.includes(item.id)
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Smartphone className="h-5 w-5" />
          Mobile Toolbar
        </CardTitle>
        <CardDescription>
          Choose which tabs appear in the bottom navigation bar on mobile (max {MAX_TOOLBAR_ITEMS}). The &quot;More&quot; button is always shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current items */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current tabs</p>
          {currentItems.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              onRemove={() => removeItem(item.id)}
              onMoveUp={index > 0 ? () => moveUp(index) : undefined}
              onMoveDown={index < currentItems.length - 1 ? () => moveDown(index) : undefined}
            />
          ))}
          {/* Always-present More indicator */}
          <div className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            <MoreHorizontal className="h-4 w-4 shrink-0" />
            <span className="flex-1">More</span>
            <span className="text-xs italic">always shown</span>
          </div>
        </div>

        {/* Available items */}
        {availableItems.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Available</p>
            {availableItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{item.label}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={selectedIds.length >= MAX_TOOLBAR_ITEMS}
                  onClick={() => addItem(item.id)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ItemRow({
  item,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: ToolbarItem;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 font-medium">{item.label}</span>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={!onMoveUp}
          onClick={onMoveUp}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={!onMoveDown}
          onClick={onMoveDown}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
