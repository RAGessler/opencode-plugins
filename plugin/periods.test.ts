import { describe, expect, test } from "bun:test"
import { parseOptions, periodRange } from "./periods"

const sprint = { anchor: "2026-10-26", days: 14 }
const local = (value: string) => new Date(`${value}T12:00:00`)

describe("calendar periods", () => {
  test.each([
    ["2026-10-26", "2026-10-26", "2026-11-09"],
    ["2026-11-08", "2026-10-26", "2026-11-09"],
    ["2026-11-09", "2026-11-09", "2026-11-23"],
    ["2026-11-23", "2026-11-23", "2026-12-07"],
    ["2026-10-25", "2026-10-12", "2026-10-26"],
  ])("rolls sprint at %s without overlaps", (now, from, to) => {
    const range = periodRange({ period: "sprint" }, sprint, local(now))
    expect(range.from).toBe(new Date(`${from}T00:00:00`).getTime())
    expect(range.to).toBe(new Date(`${to}T00:00:00`).getTime())
  })

  test("uses Monday-start weeks and local month boundaries", () => {
    expect(periodRange({ period: "week" }, sprint, local("2026-11-04")).from)
      .toBe(new Date("2026-11-02T00:00:00").getTime())
    const month = periodRange({ period: "month" }, sprint, local("2026-12-31"))
    expect(month.from).toBe(new Date("2026-12-01T00:00:00").getTime())
    expect(month.to).toBe(new Date("2027-01-01T00:00:00").getTime())
  })

  test("all time omits the lower bound so V2 can use the earliest recorded usage", () => {
    const now = local("2026-11-04")
    const range = periodRange({ period: "all" }, sprint, now)
    expect(range.from).toBeUndefined()
    expect(range.to).toBe(now.getTime())
    expect(range.label).toBe("All time")
    expect(range.dates).toBe("All recorded usage")
  })

  test("a custom end date is inclusive, including a one-day range", () => {
    const range = periodRange({ period: "custom", from: "2026-11-09", to: "2026-11-09" }, sprint)
    expect(range.from).toBe(new Date("2026-11-09T00:00:00").getTime())
    expect(range.to).toBe(new Date("2026-11-10T00:00:00").getTime())
  })

  test("rejects invalid and reversed dates rather than normalizing them", () => {
    for (const from of ["2026-02-30", "2026-13-01", "11/09", "2026-2-01"]) {
      expect(() => periodRange({ period: "custom", from, to: "2026-12-01" }, sprint)).toThrow()
    }
    expect(() => periodRange({ period: "custom", from: "2026-11-10", to: "2026-11-09" }, sprint)).toThrow()
  })

  test("advances by calendar days across daylight saving time", () => {
    const previous = process.env.TZ
    process.env.TZ = "America/Chicago"
    try {
      const range = periodRange({ period: "sprint" }, sprint, local("2026-11-04"))
      expect(range.to - range.from!).toBe((14 * 24 + 1) * 60 * 60 * 1000)
      expect(periodRange({ period: "today" }, sprint, local("2026-11-01")).to
        - periodRange({ period: "today" }, sprint, local("2026-11-01")).from!)
        .toBe(25 * 60 * 60 * 1000)
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  })

  test("validates configurable sprint and refresh settings", () => {
    expect(parseOptions({})).toEqual({ period: "week", sprint, refreshSeconds: 60 })
    expect(parseOptions({ period: "sprint", sprint: { anchor: "2026-11-09", days: 14 }, refreshSeconds: 30 }).period)
      .toBe("sprint")
    expect(parseOptions({ period: "all" }).period).toBe("all")
    for (const options of [
      { sprint: { anchor: "2026-02-30" } }, { sprint: { days: 0 } },
      { sprint: { days: 2.5 } }, { refreshSeconds: 0 }, { period: "yesterday" },
    ]) expect(() => parseOptions(options)).toThrow()
  })
})
