import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { FollowupRpc } from "./rpc"
import { parseStatus, summarize, type StatusView } from "./view"
import { FollowupWidget } from "./widget"

const REFRESH_MS = 10_000

export default Plugin.define({
  id: "pr-followup.tui",
  setup(context) {
    const [view, setView] = createSignal<StatusView | undefined>(undefined)
    const [widget, updateWidget] = context.storage.store("widget", { initial: { collapsed: false } })
    let disposed = false

    const location = () => context.location ?? context.data.location.default()
    const rpc = () => context.client.rpc(FollowupRpc)

    async function refresh() {
      if (disposed) return
      try {
        setView(parseStatus(await rpc().status({}, { location: location() })))
      } catch {
        setView(undefined)
      }
    }

    async function setEnabled(enabled: boolean) {
      try {
        const next = parseStatus(await rpc().setEnabled({ enabled }, { location: location() }))
        setView(next)
        context.ui.toast.show({ title: "PR Followup", message: enabled ? "Turned on." : "Turned off.", variant: enabled ? "success" : "info" })
      } catch (error) {
        setView(undefined)
        context.ui.toast.show({ title: "PR Followup", message: error instanceof Error ? error.message : "Cannot reach the plugin.", variant: "error" })
      }
    }

    async function command(input?: string) {
      const argument = input?.trim().toLowerCase()
      if (argument === "on" || argument === "enable") return setEnabled(true)
      if (argument === "off" || argument === "disable") return setEnabled(false)
      if (argument === "toggle") return setEnabled(!(view()?.enabled ?? false))
      if (argument === "status") {
        await refresh()
        const s = summarize(view())
        context.ui.toast.show({ title: `PR Followup · ${s.label}`, message: s.lines.join("\n"), variant: s.tone === "attention" || s.tone === "error" ? "warning" : "info", duration: 6000 })
        return
      }
      if (argument === "collapse" || argument === "expand") {
        await updateWidget(draft => { draft.collapsed = argument === "collapse" })
        return
      }
      const choice = await context.ui.dialog.select<"on" | "off" | "status">({
        title: "PR Followup",
        current: view()?.enabled ? "on" : "off",
        options: [
          { title: "Turn on", value: "on", description: "Watch PRs and fix safe feedback" },
          { title: "Turn off", value: "off", description: "Stop watching. Open decisions still pause pushes." },
          { title: "Show status", value: "status" },
        ],
      })
      if (choice) await command(choice)
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        { id: "pr-followup.menu", title: "PR Followup: menu", group: "PR Followup", palette: true, slash: { name: "followup", arguments: true }, run: command },
        { id: "pr-followup.enable", title: "PR Followup: turn on", group: "PR Followup", palette: true, run: () => setEnabled(true) },
        { id: "pr-followup.disable", title: "PR Followup: turn off", group: "PR Followup", palette: true, run: () => setEnabled(false) },
      ],
    }))

    const removeSidebar = context.ui.slot({
      append: "sidebar.content",
      render: () => <FollowupWidget
        view={view()}
        theme={context.theme}
        collapsed={widget.collapsed}
        toggleCollapsed={() => void updateWidget(draft => { draft.collapsed = !draft.collapsed })}
      />,
    })
    const removeFooter = context.ui.slot({
      append: "home.footer.status",
      render: () => {
        const s = () => summarize(view())
        return <text fg={context.theme.text.muted}>PR Followup: {s().label}</text>
      },
    })

    void refresh()
    const interval = setInterval(() => void refresh(), REFRESH_MS)
    let unsubscribe = () => {}
    try {
      unsubscribe = rpc().events.on("changed", () => void refresh())
    } catch {
      // Polling still keeps the widget current.
    }
    const reconnect = context.data.on("server.connected", () => void refresh())

    return () => {
      disposed = true
      clearInterval(interval)
      unsubscribe()
      reconnect()
      removeSidebar()
      removeFooter()
    }
  },
})
