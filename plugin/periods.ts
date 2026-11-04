export type Period = "today" | "week" | "month" | "sprint" | "all" | "custom"
export interface Selection {
  period: Period
  from?: string
  to?: string
}
export interface Sprint {
  anchor: string
  days: number
}
export interface Options {
  period: Exclude<Period, "custom">
  sprint: Sprint
  refreshSeconds: number
}
export interface PeriodRange {
  /** Omit from for all time so V2 can begin at the earliest recorded usage. */
  from?: number
  /** Exclusive local-calendar boundary. */
  to: number
  label: string
  dates: string
}

const DAY = 86_400_000
export const periodLabels: Record<Period, string> = {
  today: "Today", week: "This week", month: "This month",
  sprint: "Current sprint", all: "All time", custom: "Custom dates",
}

export function calendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use dates in YYYY-MM-DD format")
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`Invalid calendar date: ${value}`)
  }
  return date
}

export function dateString(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function addDays(date: Date, count: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

function ordinal(date: Date): number {
  // Compare civil days, not elapsed milliseconds: DST must not shift a sprint.
  const utc = new Date(0)
  utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate())
  utc.setUTCHours(0, 0, 0, 0)
  return utc.getTime() / DAY
}

export function periodRange(selection: Selection, sprint: Sprint, now = new Date()): PeriodRange {
  let start = calendarDate(dateString(now))
  let end: Date
  switch (selection.period) {
    case "all":
      return { to: now.getTime(), label: periodLabels.all, dates: "All recorded usage" }
    case "today":
      end = addDays(start, 1)
      break
    case "week":
      start = addDays(start, -((start.getDay() + 6) % 7))
      end = addDays(start, 7)
      break
    case "month":
      start.setDate(1)
      end = new Date(start)
      end.setMonth(end.getMonth() + 1)
      break
    case "sprint": {
      if (!Number.isInteger(sprint.days) || sprint.days < 1 || sprint.days > 366) throw new Error("Sprint days must be an integer from 1 to 366")
      const anchor = calendarDate(sprint.anchor)
      start = addDays(anchor, Math.floor((ordinal(start) - ordinal(anchor)) / sprint.days) * sprint.days)
      end = addDays(start, sprint.days)
      break
    }
    case "custom":
      if (!selection.from || !selection.to) throw new Error("Choose both custom dates")
      start = calendarDate(selection.from)
      end = addDays(calendarDate(selection.to), 1)
      if (end <= start) throw new Error("End date must be on or after the start date")
      break
    default:
      throw new Error("Unknown cost period")
  }
  const last = addDays(end, -1)
  const format = (date: Date) => date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: start.getFullYear() !== last.getFullYear() ? "numeric" : undefined,
  })
  return { from: start.getTime(), to: end.getTime(), label: periodLabels[selection.period], dates: `${format(start)} – ${format(last)}` }
}

function record(value: unknown): Record<string, unknown> {
  if (value === undefined) return {}
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cost options must be objects")
  return value as Record<string, unknown>
}

export function parseOptions(value: unknown): Options {
  const options = record(value)
  const sprint = record(options.sprint)
  const anchor = sprint.anchor ?? "2026-10-26"
  const days = sprint.days ?? 14
  const period = options.period ?? "week"
  const refreshSeconds = options.refreshSeconds ?? 60
  if (typeof anchor !== "string") throw new Error("Sprint anchor must be YYYY-MM-DD")
  calendarDate(anchor)
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 366) throw new Error("Sprint days must be an integer from 1 to 366")
  if (period !== "today" && period !== "week" && period !== "month" && period !== "sprint" && period !== "all") throw new Error("Initial cost period must be today, week, month, sprint, or all")
  if (typeof refreshSeconds !== "number" || !Number.isInteger(refreshSeconds) || refreshSeconds < 15 || refreshSeconds > 3600) throw new Error("Refresh interval must be 15–3600 seconds")
  return { period, sprint: { anchor, days }, refreshSeconds }
}
