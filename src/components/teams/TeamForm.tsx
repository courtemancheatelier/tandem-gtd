"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TEAM_ICON_MAP, TEAM_ICON_NAMES, TeamIcon } from "./team-icons";

interface TeamFormProps {
  initialName?: string;
  initialDescription?: string;
  initialIcon?: string;
  onSubmit: (data: { name: string; description?: string; icon?: string }) => void;
  onCancel: () => void;
  submitLabel?: string;
  loading?: boolean;
}

export function TeamForm({
  initialName = "",
  initialDescription = "",
  initialIcon = "",
  onSubmit,
  onCancel,
  submitLabel = "Create Team",
  loading = false,
}: TeamFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [icon, setIcon] = useState(initialIcon);
  const [iconSearch, setIconSearch] = useState("");

  const filteredIcons = useMemo(() => {
    if (!iconSearch.trim()) return TEAM_ICON_NAMES;
    const q = iconSearch.toLowerCase();
    return TEAM_ICON_NAMES.filter((n) => n.toLowerCase().includes(q));
  }, [iconSearch]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      icon: icon || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Icon</Label>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-10 p-0"
              >
                <TeamIcon icon={icon || null} className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-2" align="start">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder="Search icons..."
                  className="h-8 pl-7 text-sm"
                />
              </div>
              <ScrollArea className="h-[280px]">
                <div className="grid grid-cols-6 gap-1">
                  {filteredIcons.map((iconName) => {
                    const Icon = TEAM_ICON_MAP[iconName];
                    return (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => setIcon(iconName)}
                        title={iconName}
                        className={`h-9 w-9 flex items-center justify-center rounded hover:bg-accent transition-colors ${
                          icon === iconName ? "bg-accent ring-1 ring-primary" : ""
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                  {filteredIcons.length === 0 && (
                    <p className="col-span-6 text-center text-sm text-muted-foreground py-4">
                      No icons found
                    </p>
                  )}
                </div>
              </ScrollArea>
              {icon && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full mt-1 h-7 text-xs"
                  onClick={() => setIcon("")}
                >
                  Clear
                </Button>
              )}
            </PopoverContent>
          </Popover>
          <span className="text-sm text-muted-foreground">
            {icon ? "Click to change" : "Pick an icon"}
          </span>
        </div>
      </div>
      <div>
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Engineering"
          maxLength={100}
          required
        />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this team for?"
          rows={3}
          maxLength={500}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || loading}>
          {loading ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
