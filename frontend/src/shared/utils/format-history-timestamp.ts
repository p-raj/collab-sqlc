function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const monthDayFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const monthDayYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatHistoryTimestamp(value: string | Date, nowValue: Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (isSameDay(date, nowValue)) {
    return `Today · ${timeFormatter.format(date)}`;
  }

  const yesterday = new Date(nowValue);
  yesterday.setDate(nowValue.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `Yesterday · ${timeFormatter.format(date)}`;
  }

  if (date.getFullYear() === nowValue.getFullYear()) {
    return `${monthDayFormatter.format(date)} · ${timeFormatter.format(date)}`;
  }

  return `${monthDayYearFormatter.format(date)} · ${timeFormatter.format(date)}`;
}
