import { For, Show } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"
import { summarize, type StatusView, type Tone } from "./view"

export type WidgetTheme = { text: Pick<Plugin.Context["theme"]["text"], "base" | "muted" | "feedback"> }

const glyph: Record<Tone, string> = { off: "○", offline: "○", idle: "●", working: "●", attention: "▲", error: "●" }

function toneColor(theme: WidgetTheme, tone: Tone) {
  switch (tone) {
    case "idle": case "working": return theme.text.feedback.success.base
    case "attention": return theme.text.feedback.warning.base
    case "error": return theme.text.feedback.error.base
    default: return theme.text.muted
  }
}

export function FollowupWidget(props: {
  view?: StatusView
  theme: WidgetTheme
  collapsed: boolean
  toggleCollapsed: () => void
}) {
  const summary = () => summarize(props.view)
  return (
    <box flexDirection="column" width="100%" paddingTop={1}>
      <box flexDirection="row" justifyContent="space-between" onMouseUp={props.toggleCollapsed}>
        <box flexDirection="row" gap={1}>
          <text fg={props.theme.text.base}>{props.collapsed ? "▸" : "▾"}</text>
          <text fg={toneColor(props.theme, summary().tone)}>{glyph[summary().tone]}</text>
          <text fg={props.theme.text.base}>PR Followup</text>
        </box>
        <text fg={toneColor(props.theme, summary().tone)}>{summary().label}</text>
      </box>
      <Show when={!props.collapsed}>
        <For each={summary().lines}>
          {line => <text fg={props.theme.text.muted} wrapMode="word">{line}</text>}
        </For>
      </Show>
    </box>
  )
}
