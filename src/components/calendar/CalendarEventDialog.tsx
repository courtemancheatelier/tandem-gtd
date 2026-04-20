"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Trash2 } from "lucide-react";

interface CalendarEventData {
  id?: string;
  title: string;
  eventType: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  reminderMinutes?: number | null;
  recurrenceRule?: string | null;
  recurringEventId?: string | null;
  isVirtual?: boolean;
  taskId?: string | null;
  projectId?: string | null;
}

interface CalendarEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEventData | null;
  defaultDate?: string;
  defaultTime?: string;
  onSave: (data: CalendarEventData) => void;
  onDelete?: (id: string, scope?: "this" | "future" | "all") => void;
}

function toDateInputValue(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toISOString().slice(0, 10);
}

function toTimeInputValue(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// Generate time options in 15-minute intervals (00:00 to 23:45)
function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "AM" : "PM";
      const label = `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

function formatTimeLabel(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const newH = Math.min(h + 1, 23);
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Validate and normalize typed time input (e.g. "2:30pm" → "14:30", "14:30" → "14:30")
function parseTypedTime(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  // Try HH:MM format
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1]);
    const m = parseInt(match24[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  // Try H:MMam/pm format
  const match12 = trimmed.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/);
  if (match12) {
    let h = parseInt(match12[1]);
    const m = match12[2] ? parseInt(match12[2]) : 0;
    const isPM = match12[3] === "pm";
    if (h === 12) h = isPM ? 12 : 0;
    else if (isPM) h += 12;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return null;
}

function TimePickerSelect({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}) {
  const [isTyping, setIsTyping] = useState(false);
  const [typedValue, setTypedValue] = useState("");

  function commitTypedValue() {
    const parsed = parseTypedTime(typedValue);
    if (parsed) {
      onChange(parsed);
    }
    setIsTyping(false);
    setTypedValue("");
  }

  if (isTyping) {
    return (
      <Input
        autoFocus
        value={typedValue}
        onChange={(e) => setTypedValue(e.target.value)}
        onBlur={commitTypedValue}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitTypedValue();
          }
          if (e.key === "Escape") {
            setIsTyping(false);
            setTypedValue("");
          }
        }}
        placeholder="e.g. 2:30pm"
        className="h-10"
      />
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        onDoubleClick={(e) => {
          e.preventDefault();
          setTypedValue(value ? formatTimeLabel(value) : "");
          setIsTyping(true);
        }}
        title="Double-click to type a custom time"
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[200px]">
        {TIME_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DeleteButton({
  event,
  onDelete,
}: {
  event: CalendarEventData;
  onDelete: (scope?: "this" | "future" | "all") => void;
}) {
  const [showOptions, setShowOptions] = useState(false);
  const isRecurring = !!(event.recurrenceRule || event.recurringEventId || event.isVirtual);

  if (!isRecurring) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => onDelete()}
      >
        <Trash2 className="h-4 w-4 mr-1" />
        Delete
      </Button>
    );
  }

  if (!showOptions) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => setShowOptions(true)}
      >
        <Trash2 className="h-4 w-4 mr-1" />
        Delete
      </Button>
    );
  }

  return (
    <div className="mr-auto flex flex-col gap-1">
      <p className="text-xs text-muted-foreground mb-1">Delete recurring event:</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-start text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
        onClick={() => onDelete("this")}
      >
        This event only
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-start text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
        onClick={() => onDelete("future")}
      >
        This and future events
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-start text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
        onClick={() => onDelete("all")}
      >
        All events in series
      </Button>
    </div>
  );
}

export function CalendarEventDialog({
  open,
  onOpenChange,
  event,
  defaultDate,
  defaultTime,
  onSave,
  onDelete,
}: CalendarEventDialogProps) {
  const isEditing = !!event?.id;

  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("TIME_SPECIFIC");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState<string>("__none__");
  const [recurrencePreset, setRecurrencePreset] = useState<string>("none");
  const [customFreq, setCustomFreq] = useState("WEEKLY");
  const [customInterval, setCustomInterval] = useState("1");
  const [customDays, setCustomDays] = useState<string[]>([]);
  const [customEndType, setCustomEndType] = useState<"never" | "count" | "until">("never");
  const [customCount, setCustomCount] = useState("10");
  const [customUntil, setCustomUntil] = useState("");

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setEventType(event.eventType);
      setDate(toDateInputValue(event.date));
      setStartTime(toTimeInputValue(event.startTime));
      setEndTime(toTimeInputValue(event.endTime));
      setLocation(event.location || "");
      setDescription(event.description || "");
      setReminderMinutes(event.reminderMinutes != null ? String(event.reminderMinutes) : "__none__");
      // Parse recurrence
      if (event.recurrenceRule) {
        const rule = event.recurrenceRule;
        if (rule === "FREQ=DAILY") setRecurrencePreset("daily");
        else if (rule === "FREQ=WEEKLY") setRecurrencePreset("weekly");
        else if (rule === "FREQ=WEEKLY;INTERVAL=2") setRecurrencePreset("biweekly");
        else if (rule === "FREQ=MONTHLY") setRecurrencePreset("monthly");
        else setRecurrencePreset("custom");
        // For custom, parse and populate fields
        if (rule.includes("INTERVAL=")) {
          const m = rule.match(/INTERVAL=(\d+)/);
          if (m) setCustomInterval(m[1]);
        }
        if (rule.includes("BYDAY=")) {
          const m = rule.match(/BYDAY=([A-Z,]+)/);
          if (m) setCustomDays(m[1].split(","));
        }
        const freqMatch = rule.match(/FREQ=(\w+)/);
        if (freqMatch) setCustomFreq(freqMatch[1]);
      } else {
        setRecurrencePreset("none");
      }
    } else {
      setTitle("");
      setEventType("TIME_SPECIFIC");
      const now = new Date();
      const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      setDate(defaultDate || localToday);
      setStartTime(defaultTime || "");
      setEndTime(defaultTime ? addOneHour(defaultTime) : "");
      setLocation("");
      setDescription("");
      setReminderMinutes("__none__");
      setRecurrencePreset("none");
      setCustomFreq("WEEKLY");
      setCustomInterval("1");
      setCustomDays([]);
      setCustomEndType("never");
      setCustomCount("10");
      setCustomUntil("");
    }
  }, [event, defaultDate, defaultTime, open]);

  const showTimeFields = eventType === "TIME_SPECIFIC" || eventType === "TIME_BLOCK";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;

    // Build full datetime strings for startTime/endTime
    let startDateTime: string | null = null;
    let endDateTime: string | null = null;

    if (showTimeFields && startTime) {
      startDateTime = new Date(`${date}T${startTime}:00`).toISOString();
    }
    if (showTimeFields && endTime) {
      endDateTime = new Date(`${date}T${endTime}:00`).toISOString();
    }

    // Build recurrence rule
    let recurrenceRule: string | null = null;
    if (recurrencePreset === "daily") recurrenceRule = "FREQ=DAILY";
    else if (recurrencePreset === "weekly") recurrenceRule = "FREQ=WEEKLY";
    else if (recurrencePreset === "biweekly") recurrenceRule = "FREQ=WEEKLY;INTERVAL=2";
    else if (recurrencePreset === "monthly") recurrenceRule = "FREQ=MONTHLY";
    else if (recurrencePreset === "custom") {
      const parts = [`FREQ=${customFreq}`];
      const interval = parseInt(customInterval);
      if (interval > 1) parts.push(`INTERVAL=${interval}`);
      if (customDays.length > 0) parts.push(`BYDAY=${customDays.join(",")}`);
      if (customEndType === "count") parts.push(`COUNT=${customCount}`);
      else if (customEndType === "until" && customUntil) {
        const u = customUntil.replace(/-/g, "");
        parts.push(`UNTIL=${u}T235959Z`);
      }
      recurrenceRule = parts.join(";");
    }

    onSave({
      id: event?.id,
      title: title.trim(),
      eventType,
      date: new Date(`${date}T00:00:00`).toISOString(),
      startTime: startDateTime,
      endTime: endDateTime,
      allDay: !showTimeFields,
      location: location || null,
      description: description || null,
      reminderMinutes: reminderMinutes !== "__none__" ? parseInt(reminderMinutes) : null,
      recurrenceRule,
      taskId: event?.taskId,
      projectId: event?.projectId,
    });

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Event" : "New Event"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="cal-title">Title</Label>
              <Input
                id="cal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                autoFocus
              />
            </div>

            <div>
              <Label htmlFor="cal-type">Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger id="cal-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TIME_SPECIFIC">Time-specific</SelectItem>
                  <SelectItem value="DAY_SPECIFIC">Day-specific</SelectItem>
                  <SelectItem value="INFORMATION">Information</SelectItem>
                  <SelectItem value="TIME_BLOCK">Time block</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="cal-date">Date</Label>
              <Input
                id="cal-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {showTimeFields && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start time</Label>
                  <TimePickerSelect
                    value={startTime}
                    onChange={(val) => {
                      setStartTime(val);
                      if (!endTime || endTime <= val) {
                        setEndTime(addOneHour(val));
                      }
                    }}
                    placeholder="Select time"
                  />
                </div>
                <div>
                  <Label>End time</Label>
                  <TimePickerSelect
                    value={endTime}
                    onChange={setEndTime}
                    placeholder="Select time"
                  />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="cal-location">Location</Label>
              <Input
                id="cal-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div>
              <Label htmlFor="cal-desc">Description</Label>
              <Input
                id="cal-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div>
              <Label htmlFor="cal-reminder">Reminder</Label>
              <Select value={reminderMinutes} onValueChange={setReminderMinutes}>
                <SelectTrigger id="cal-reminder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No reminder</SelectItem>
                  <SelectItem value="5">5 minutes before</SelectItem>
                  <SelectItem value="15">15 minutes before</SelectItem>
                  <SelectItem value="30">30 minutes before</SelectItem>
                  <SelectItem value="60">1 hour before</SelectItem>
                  <SelectItem value="1440">1 day before</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="cal-repeat">Repeat</Label>
              <Select value={recurrencePreset} onValueChange={setRecurrencePreset}>
                <SelectTrigger id="cal-repeat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Does not repeat</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="custom">Custom...</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recurrencePreset === "custom" && (
              <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Frequency</Label>
                    <Select value={customFreq} onValueChange={setCustomFreq}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DAILY">Daily</SelectItem>
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="YEARLY">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Every</Label>
                    <Input
                      type="number"
                      min="1"
                      max="99"
                      value={customInterval}
                      onChange={(e) => setCustomInterval(e.target.value)}
                    />
                  </div>
                </div>

                {customFreq === "WEEKLY" && (
                  <div>
                    <Label className="text-xs">On days</Label>
                    <div className="flex gap-1 mt-1">
                      {[
                        { label: "S", value: "SU" },
                        { label: "M", value: "MO" },
                        { label: "T", value: "TU" },
                        { label: "W", value: "WE" },
                        { label: "T", value: "TH" },
                        { label: "F", value: "FR" },
                        { label: "S", value: "SA" },
                      ].map((day) => (
                        <button
                          key={day.value}
                          type="button"
                          className={`h-7 w-7 rounded-full text-xs font-medium transition-colors ${
                            customDays.includes(day.value)
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-accent"
                          }`}
                          onClick={() => {
                            setCustomDays((prev) =>
                              prev.includes(day.value)
                                ? prev.filter((d) => d !== day.value)
                                : [...prev, day.value]
                            );
                          }}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-xs">Ends</Label>
                  <Select value={customEndType} onValueChange={(v) => setCustomEndType(v as "never" | "count" | "until")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never</SelectItem>
                      <SelectItem value="count">After N occurrences</SelectItem>
                      <SelectItem value="until">On date</SelectItem>
                    </SelectContent>
                  </Select>
                  {customEndType === "count" && (
                    <Input
                      type="number"
                      min="1"
                      max="999"
                      value={customCount}
                      onChange={(e) => setCustomCount(e.target.value)}
                      className="mt-1"
                      placeholder="Number of occurrences"
                    />
                  )}
                  {customEndType === "until" && (
                    <Input
                      type="date"
                      value={customUntil}
                      onChange={(e) => setCustomUntil(e.target.value)}
                      className="mt-1"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {isEditing && onDelete && event?.id && (
              <DeleteButton
                event={event}
                onDelete={(scope) => {
                  onDelete(event.id!, scope);
                  onOpenChange(false);
                }}
              />
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || !date}>
              {isEditing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
