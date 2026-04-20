"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

interface MentionPickerProps {
  members: { id: string; name: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  currentUserId: string;
}

export function MentionPicker({ members, selected, onChange, currentUserId }: MentionPickerProps) {
  const others = members.filter((m) => m.id !== currentUserId);
  if (others.length === 0) return null;

  function toggle(userId: string) {
    if (selected.includes(userId)) {
      onChange(selected.filter((id) => id !== userId));
    } else {
      onChange([...selected, userId]);
    }
  }

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
        Mention team members
      </label>
      <div className="flex flex-wrap gap-2">
        {others.map((member) => (
          <label
            key={member.id}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <Checkbox
              checked={selected.includes(member.id)}
              onCheckedChange={() => toggle(member.id)}
            />
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              @{member.name}
            </Badge>
          </label>
        ))}
      </div>
    </div>
  );
}
