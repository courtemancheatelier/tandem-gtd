"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Timer } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface TimeBlockPopoverProps {
  taskId: string;
  children?: React.ReactNode;
}

export function TimeBlockPopover({ taskId, children }: TimeBlockPopoverProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const startDateTime = new Date(`${date}T${startTime}:00`).toISOString();

      const res = await fetch("/api/calendar/time-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          date: new Date(`${date}T00:00:00`).toISOString(),
          startTime: startDateTime,
          durationMinutes: parseInt(duration),
        }),
      });

      if (res.ok) {
        toast({ title: "Time block created" });
        setOpen(false);
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error || "Failed to create time block", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
            <Timer className="h-3.5 w-3.5 mr-1" />
            Block Time
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Schedule a time block</p>

          <div>
            <Label htmlFor="tb-date" className="text-xs">Date</Label>
            <Input
              id="tb-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <Label htmlFor="tb-start" className="text-xs">Start time</Label>
            <Input
              id="tb-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <Label htmlFor="tb-duration" className="text-xs">Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger id="tb-duration" className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="90">1.5 hours</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
                <SelectItem value="180">3 hours</SelectItem>
                <SelectItem value="240">4 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            className="w-full"
            onClick={handleSubmit}
            disabled={submitting || !date || !startTime}
          >
            {submitting ? "Creating..." : "Create Time Block"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
