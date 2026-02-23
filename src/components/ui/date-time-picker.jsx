"use client";

import { useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad2(value) {
    return String(value).padStart(2, "0");
}

function formatLocalDateTime(value) {
    return [
        `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`,
        `T${pad2(value.getHours())}:${pad2(value.getMinutes())}`,
    ].join("");
}

function parseLocalDateTime(value) {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    const match = value.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
    );
    if (!match) {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return null;
        }
        return parsed;
    }

    const [, year, month, day, hour, minute, second] = match;
    const parsed = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second || "0"),
        0,
    );

    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
}

function isSameDay(left, right) {
    if (!left || !right) {
        return false;
    }

    return (
        left.getFullYear() === right.getFullYear() &&
        left.getMonth() === right.getMonth() &&
        left.getDate() === right.getDate()
    );
}

function buildCalendarDays(viewDate) {
    const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const startDayOffset = startOfMonth.getDay();
    const start = new Date(
        viewDate.getFullYear(),
        viewDate.getMonth(),
        1 - startDayOffset,
    );

    return Array.from({ length: 42 }, (_, index) => {
        const day = new Date(start);
        day.setDate(start.getDate() + index);

        return {
            date: day,
            isCurrentMonth: day.getMonth() === viewDate.getMonth(),
        };
    });
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => pad2(index));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => pad2(index));

export function DateTimePicker({
    value,
    onChange,
    placeholder = "Set due date",
    disabled = false,
    className,
}) {
    const parsedValue = useMemo(() => parseLocalDateTime(value), [value]);
    const [open, setOpen] = useState(false);
    const [viewDate, setViewDate] = useState(() => parsedValue || new Date());
    const [selectedDate, setSelectedDate] = useState(() => parsedValue);
    const [hour, setHour] = useState(() => pad2(parsedValue?.getHours() ?? 9));
    const [minute, setMinute] = useState(() => pad2(parsedValue?.getMinutes() ?? 0));

    const days = useMemo(() => buildCalendarDays(viewDate), [viewDate]);

    const displayValue = parsedValue
        ? parsedValue.toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
          })
        : placeholder;

    const selectedPreview = selectedDate
        ? new Date(
              selectedDate.getFullYear(),
              selectedDate.getMonth(),
              selectedDate.getDate(),
              Number(hour),
              Number(minute),
              0,
              0,
          ).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
          })
        : "No date selected";

    const syncFromValue = () => {
        const nextValue = parseLocalDateTime(value);
        const fallback = nextValue || new Date();
        setSelectedDate(nextValue);
        setViewDate(new Date(fallback.getFullYear(), fallback.getMonth(), 1));
        setHour(pad2(nextValue?.getHours() ?? 9));
        setMinute(pad2(nextValue?.getMinutes() ?? 0));
    };

    const applySelection = () => {
        if (!selectedDate) {
            return;
        }

        const nextValue = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
            Number(hour),
            Number(minute),
            0,
            0,
        );
        onChange(formatLocalDateTime(nextValue));
        setOpen(false);
    };

    const clearSelection = () => {
        onChange("");
        setSelectedDate(null);
        setOpen(false);
    };

    return (
        <Popover
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                if (nextOpen) {
                    syncFromValue();
                }
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                        "h-9 w-full justify-between border-zinc-700 bg-zinc-950 px-3 text-sm font-normal text-zinc-100 hover:bg-zinc-900",
                        !parsedValue ? "text-zinc-400" : "",
                        className,
                    )}
                >
                    <span className="truncate text-left">{displayValue}</span>
                    <CalendarClock className="size-4 shrink-0" />
                </Button>
            </PopoverTrigger>

            <PopoverContent align="start" className="w-[320px] border-zinc-800 bg-zinc-950 p-3">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-zinc-300 hover:bg-zinc-800"
                            onClick={() =>
                                setViewDate(
                                    (previous) =>
                                        new Date(
                                            previous.getFullYear(),
                                            previous.getMonth() - 1,
                                            1,
                                        ),
                                )
                            }
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                        <p className="text-sm font-medium text-zinc-100">
                            {viewDate.toLocaleString(undefined, {
                                month: "long",
                                year: "numeric",
                            })}
                        </p>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-zinc-300 hover:bg-zinc-800"
                            onClick={() =>
                                setViewDate(
                                    (previous) =>
                                        new Date(
                                            previous.getFullYear(),
                                            previous.getMonth() + 1,
                                            1,
                                        ),
                                )
                            }
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {WEEKDAY_LABELS.map((label) => (
                            <span
                                key={label}
                                className="text-center text-xs font-medium text-zinc-500"
                            >
                                {label}
                            </span>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {days.map(({ date, isCurrentMonth }) => {
                            const isSelected = isSameDay(selectedDate, date);
                            const isToday = isSameDay(new Date(), date);

                            return (
                                <button
                                    key={date.toISOString()}
                                    type="button"
                                    onClick={() => setSelectedDate(new Date(date))}
                                    className={cn(
                                        "h-8 rounded text-sm transition-colors",
                                        isCurrentMonth
                                            ? "text-zinc-200 hover:bg-zinc-800"
                                            : "text-zinc-600 hover:bg-zinc-900",
                                        isToday && !isSelected
                                            ? "border border-zinc-700"
                                            : "",
                                        isSelected
                                            ? "bg-zinc-100 font-medium text-zinc-900 hover:bg-zinc-200"
                                            : "",
                                    )}
                                >
                                    {date.getDate()}
                                </button>
                            );
                        })}
                    </div>

                    <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                        <p className="mb-2 text-xs text-zinc-400">Time</p>
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <select
                                value={hour}
                                onChange={(event) => setHour(event.target.value)}
                                className="h-8 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
                            >
                                {HOUR_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                            <span className="text-zinc-400">:</span>
                            <select
                                value={minute}
                                onChange={(event) => setMinute(event.target.value)}
                                className="h-8 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
                            >
                                {MINUTE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <p className="mt-2 text-xs text-zinc-500">{selectedPreview}</p>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-3">
                        <Button
                            type="button"
                            variant="ghost"
                            className="text-zinc-300 hover:bg-zinc-800"
                            onClick={clearSelection}
                        >
                            Clear
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                                disabled={!selectedDate}
                                onClick={applySelection}
                            >
                                Apply
                            </Button>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
