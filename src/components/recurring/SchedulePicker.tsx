"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface SchedulePickerProps {
  value: string;
  onChange: (value: string) => void;
}

const DAY_NAMES = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: ordinal(i + 1),
}));

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const MONTH_NAMES = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

type ScheduleType = "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly" | "every_n_days";

function parseInitialValue(value: string): { type: ScheduleType; param: string; param2: string } {
  if (value === "daily") return { type: "daily", param: "", param2: "" };
  if (value === "weekdays") return { type: "weekdays", param: "", param2: "" };
  if (value.startsWith("weekly:")) return { type: "weekly", param: value.split(":")[1], param2: "" };
  if (value.startsWith("biweekly:")) return { type: "biweekly", param: value.split(":")[1], param2: "" };
  if (value.startsWith("monthly:")) return { type: "monthly", param: value.split(":")[1], param2: "" };
  if (value.startsWith("quarterly:")) return { type: "quarterly", param: value.split(":")[1], param2: "" };
  if (value.startsWith("yearly:")) {
    const parts = value.split(":");
    return { type: "yearly", param: parts[1], param2: parts[2] };
  }
  if (value.startsWith("every_n_days:")) return { type: "every_n_days", param: value.split(":")[1], param2: "" };
  return { type: "daily", param: "", param2: "" };
}

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  const initial = parseInitialValue(value);
  const [scheduleType, setScheduleType] = useState<ScheduleType>(initial.type);
  const [param, setParam] = useState(initial.param);
  const [param2, setParam2] = useState(initial.param2);

  // Emit the composed value whenever type or params change
  useEffect(() => {
    let expression: string;
    switch (scheduleType) {
      case "daily":
        expression = "daily";
        break;
      case "weekdays":
        expression = "weekdays";
        break;
      case "weekly":
        expression = `weekly:${param || "1"}`;
        break;
      case "biweekly":
        expression = `biweekly:${param || "1"}`;
        break;
      case "monthly":
        expression = `monthly:${param || "1"}`;
        break;
      case "quarterly":
        expression = `quarterly:${param || "1"}`;
        break;
      case "yearly":
        expression = `yearly:${param || "1"}:${param2 || "1"}`;
        break;
      case "every_n_days":
        expression = `every_n_days:${param || "7"}`;
        break;
      default:
        expression = "daily";
    }
    onChange(expression);
  }, [scheduleType, param, param2, onChange]);

  const handleTypeChange = (newType: string) => {
    const typed = newType as ScheduleType;
    setScheduleType(typed);
    // Set sensible defaults for the parameter
    if (typed === "weekly" || typed === "biweekly") {
      setParam((prev) => {
        const n = parseInt(prev, 10);
        return !isNaN(n) && n >= 0 && n <= 6 ? prev : "1";
      });
    } else if (typed === "monthly" || typed === "quarterly") {
      setParam((prev) => {
        const n = parseInt(prev, 10);
        return !isNaN(n) && n >= 1 && n <= 31 ? prev : "1";
      });
    } else if (typed === "yearly") {
      setParam((prev) => {
        const n = parseInt(prev, 10);
        return !isNaN(n) && n >= 1 && n <= 12 ? prev : "1";
      });
      setParam2((prev) => {
        const n = parseInt(prev, 10);
        return !isNaN(n) && n >= 1 && n <= 31 ? prev : "1";
      });
    } else if (typed === "every_n_days") {
      setParam((prev) => {
        const n = parseInt(prev, 10);
        return !isNaN(n) && n >= 1 && n <= 999 ? prev : "7";
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Frequency</Label>
        <Select value={scheduleType} onValueChange={handleTypeChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekdays">Weekdays (Mon-Fri)</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
            <SelectItem value="every_n_days">Every N Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(scheduleType === "weekly" || scheduleType === "biweekly") && (
        <div className="space-y-1.5">
          <Label>Day of Week</Label>
          <Select value={param || "1"} onValueChange={setParam}>
            <SelectTrigger>
              <SelectValue placeholder="Select day" />
            </SelectTrigger>
            <SelectContent>
              {DAY_NAMES.map((day) => (
                <SelectItem key={day.value} value={day.value}>
                  {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(scheduleType === "monthly" || scheduleType === "quarterly") && (
        <div className="space-y-1.5">
          <Label>Day of Month</Label>
          <Select value={param || "1"} onValueChange={setParam}>
            <SelectTrigger>
              <SelectValue placeholder="Select date" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_DAYS.map((day) => (
                <SelectItem key={day.value} value={day.value}>
                  {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {scheduleType === "yearly" && (
        <>
          <div className="space-y-1.5">
            <Label>Month</Label>
            <Select value={param || "1"} onValueChange={setParam}>
              <SelectTrigger>
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Day of Month</Label>
            <Select value={param2 || "1"} onValueChange={setParam2}>
              <SelectTrigger>
                <SelectValue placeholder="Select date" />
              </SelectTrigger>
              <SelectContent>
                {MONTH_DAYS.map((day) => (
                  <SelectItem key={day.value} value={day.value}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {scheduleType === "every_n_days" && (
        <div className="space-y-1.5">
          <Label>Every how many days?</Label>
          <input
            type="number"
            min={1}
            max={999}
            value={param || "7"}
            onChange={(e) => setParam(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      )}
    </div>
  );
}
