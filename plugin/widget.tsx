import { For, Show } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"
import type { CostRow } from "./costs"
import { formatCost } from "./costs"
import type { CostState } from "./monitor"

type Theme = { text: Pick<Plugin.Context["theme"]["text"], "base" | "muted"> }

function Ranking(props: { title: string; rows: CostRow[]; theme: Theme; projectID?: string }) {
  return (
    <box flexDirection="column" marginTop={1}>
      <text fg={props.theme.text.muted}>{props.title}</text>
      <For each={props.rows.slice(0, 3)} fallback={<text fg={props.theme.text.muted}>No reported spend</text>}>
        {row => (
          <box flexDirection="row" width="100%" gap={1}>
            <text flexGrow={1} flexShrink={1} wrapMode="none" fg={row.id === props.projectID ? props.theme.text.base : props.theme.text.muted}>
              {row.label}
            </text>
            <text flexShrink={0} fg={props.theme.text.base}>{formatCost(row.cost)}</text>
          </box>
        )}
      </For>
    </box>
  )
}

export function CostWidget(props: {
  state: CostState
  theme: Theme
  projectID?: string
  collapsed: boolean
  toggleCollapsed: () => void
}) {
  return (
    <box flexDirection="column" width="100%" paddingTop={1}>
      <box flexDirection="row" justifyContent="space-between" onMouseUp={props.toggleCollapsed}>
        <text fg={props.theme.text.base}>{props.collapsed ? "▸" : "▾"} Costs · {props.state.range.label}</text>
        <text fg={props.state.snapshot ? props.theme.text.base : props.theme.text.muted}>
          {props.state.snapshot ? formatCost(props.state.snapshot.total) : props.state.error ? "unavailable" : props.state.loading ? "…" : ""}
        </text>
      </box>
      <Show when={!props.collapsed}>
        <text fg={props.theme.text.muted}>{props.state.range.dates}</text>
        <Show when={props.state.snapshot} fallback={
          <text fg={props.theme.text.muted}>{props.state.error ?? "Loading costs…"}</text>
        }>
          {snapshot => (
            <>
              <Show when={props.state.error}>
                <text fg={props.theme.text.muted}>Stale · refresh unavailable</text>
              </Show>
              <Ranking title="Top models" rows={snapshot().models} theme={props.theme} />
              <Ranking title="Top projects" rows={snapshot().projects} theme={props.theme} projectID={props.projectID} />
              <text marginTop={1} fg={props.theme.text.muted}>Reported cost · not billing</text>
              <text fg={props.theme.text.muted}>/costs to change period</text>
            </>
          )}
        </Show>
      </Show>
    </box>
  )
}
