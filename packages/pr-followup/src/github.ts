import type { Finding, PrRef, Severity, Snapshot, Source } from "./types"

export const REPLY_MARKER = "<!-- pr-followup:reply -->"

export type Runner = (args: string[]) => Promise<string>

export function parsePrRef(input: string): PrRef {
  const url = /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/.exec(input)
  if (url) return { owner: url[1]!, repo: url[2]!, number: Number(url[3]) }
  const short = /^([^/\s#]+)\/([^/\s#]+)#(\d+)$/.exec(input.trim())
  if (short) return { owner: short[1]!, repo: short[2]!, number: Number(short[3]) }
  throw new Error(`Cannot read the PR "${input}". Use owner/repo#123 or a PR URL.`)
}

export function parseSeverity(body: string): Severity {
  const map = (word: string): Severity => {
    const w = word.toLowerCase()
    if (w === "high" || w === "critical" || w === "blocker") return "high"
    if (w === "medium" || w === "major") return "medium"
    if (w === "low" || w === "minor" || w === "nit") return "low"
    return "unknown"
  }
  const labelled = /(?:severity|priority)\W{0,6}(high|medium|low|critical|blocker|major|minor|nit)\b/i.exec(body)
  if (labelled) return map(labelled[1]!)
  const first = body.split("\n", 1)[0] ?? ""
  const lead = /^\W*(high|medium|low|critical|blocker|major|minor|nit)\b/i.exec(first)
  return lead ? map(lead[1]!) : "unknown"
}

export function classifySource(login: string, type?: string): Source {
  if (/copilot/i.test(login)) return "copilot"
  if (type === "Bot" || /\[bot\]$/.test(login)) return "bot"
  return "human"
}

interface RawUser { login?: string; type?: string }
interface RawComment { id: number; user?: RawUser; body?: string; html_url?: string; path?: string; line?: number | null; original_line?: number | null; updated_at?: string; created_at?: string }
interface RawReview { id: number; user?: RawUser; body?: string; state?: string; html_url?: string; submitted_at?: string }
export interface RawPr { head?: { sha?: string }; state?: string; merged?: boolean; merged_at?: string | null }

export interface RawSnapshot {
  pull: RawPr
  inline: RawComment[]
  issue: RawComment[]
  reviews: RawReview[]
}

export function parseSnapshot(raw: RawSnapshot): Snapshot {
  const findings: Finding[] = []
  const common = (user?: RawUser) => {
    const author = user?.login ?? "unknown"
    return { author, source: classifySource(author, user?.type) }
  }
  const usable = (body?: string) => !!body && body.trim() !== "" && !body.trimStart().startsWith(REPLY_MARKER)

  for (const c of raw.inline) {
    if (!usable(c.body)) continue
    findings.push({
      id: `inline:${c.id}`, kind: "inline", ...common(c.user), severity: parseSeverity(c.body!),
      path: c.path, line: c.line ?? c.original_line ?? undefined, body: c.body!, url: c.html_url ?? "",
      updatedAt: c.updated_at ?? c.created_at ?? "",
    })
  }
  for (const c of raw.issue) {
    if (!usable(c.body)) continue
    findings.push({
      id: `conversation:${c.id}`, kind: "conversation", ...common(c.user), severity: parseSeverity(c.body!),
      body: c.body!, url: c.html_url ?? "", updatedAt: c.updated_at ?? c.created_at ?? "",
    })
  }
  for (const r of raw.reviews) {
    if (!usable(r.body)) continue
    const who = common(r.user)
    // A Copilot or bot review summary describes its inline comments. It is not a finding.
    if (who.source !== "human" && r.state !== "CHANGES_REQUESTED") continue
    if (r.state === "PENDING" || r.state === "DISMISSED") continue
    findings.push({
      id: `review:${r.id}`, kind: "review", ...who, severity: parseSeverity(r.body!),
      body: r.body!, url: r.html_url ?? "", updatedAt: r.submitted_at ?? "",
    })
  }
  return {
    head: raw.pull.head?.sha ?? "",
    state: raw.pull.merged || raw.pull.merged_at ? "merged" : raw.pull.state === "closed" ? "closed" : "open",
    findings,
  }
}

const flatten = <T>(json: string): T[] => {
  const data = JSON.parse(json) as unknown
  return (Array.isArray(data) ? data.flat() : []) as T[]
}

export function createGitHub(gh: Runner) {
  return {
    async snapshot(pr: PrRef): Promise<Snapshot> {
      const base = `repos/${pr.owner}/${pr.repo}`
      const paged = (path: string) => gh(["api", "--paginate", "--slurp", path])
      const [pull, inline, issue, reviews] = await Promise.all([
        gh(["api", `${base}/pulls/${pr.number}`]),
        paged(`${base}/pulls/${pr.number}/comments?per_page=100`),
        paged(`${base}/issues/${pr.number}/comments?per_page=100`),
        paged(`${base}/pulls/${pr.number}/reviews?per_page=100`),
      ])
      return parseSnapshot({
        pull: JSON.parse(pull) as RawPr,
        inline: flatten<RawComment>(inline),
        issue: flatten<RawComment>(issue),
        reviews: flatten<RawReview>(reviews),
      })
    },
  }
}
