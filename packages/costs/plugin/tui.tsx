import { Plugin } from "@opencode/plugin/tui"
import { createEffect, createSignal } from "solid-js"
import { loadCosts, formatCost } from "./costs"
import { createCostMonitor, type CostState } from "./monitor"
import { dateString, parseOptions, periodLabels, periodRange, type Period, type Selection } from "./periods"
import { CostWidget } from "./widget"

export default Plugin.define({
  id: "standup.costs",
  setup(context) {
    let options: ReturnType<typeof parseOptions>
    try {
      options = parseOptions(context.options)
    } catch (error) {
      context.ui.toast.show({ title: "Cost widget configuration", message: error instanceof Error ? error.message : "Invalid options", variant: "error" })
      return context.ui.slot({ append: "sidebar.content", render: () => <text fg={context.theme.text.muted}>Cost widget: invalid configuration</text> })
    }

    const [selection, updateSelection] = context.storage.store<Selection>("period", { initial: { period: options.period } })
    const [widgetPreferences, updateWidgetPreferences] = context.storage.store("widget", { initial: { collapsed: false } })
    const [state, setState] = createSignal<CostState>({
      range: periodRange({ period: options.period }, options.sprint), loading: true,
    })
    const monitor = createCostMonitor((range, signal) => loadCosts(context.client, range, signal), setState)
    let disposed = false

    function refresh() {
      if (disposed) return
      try {
        void monitor.refresh(periodRange(selection, options.sprint))
      } catch {
        setState(previous => ({ ...previous, snapshot: undefined, loading: false, error: "Invalid saved period · use /costs" }))
      }
    }

    async function setCollapsed(collapsed = !widgetPreferences.collapsed) {
      if (disposed) return
      await updateWidgetPreferences(draft => { draft.collapsed = collapsed })
    }

    async function changePeriod(input?: string) {
      const argument = input?.trim()
      if (argument === "refresh") { refresh(); return }
      if (argument === "collapse") { await setCollapsed(true); return }
      if (argument === "expand") { await setCollapsed(false); return }
      if (argument === "toggle") { await setCollapsed(); return }
      const requested = argument
      const period = requested && Object.hasOwn(periodLabels, requested) ? requested as Period : await context.ui.dialog.select<Period>({
        title: "Cost period", current: selection.period,
        options: (Object.keys(periodLabels) as Period[]).map(value => ({ title: periodLabels[value], value })),
      })
      if (!period || disposed) return
      const next: Selection = { period }
      if (period === "custom") {
        const from = await context.ui.dialog.prompt({ title: "Cost range start", description: "YYYY-MM-DD, inclusive", value: selection.from ?? dateString(new Date()) })
        if (from === undefined || disposed) return
        const to = await context.ui.dialog.prompt({ title: "Cost range end", description: "YYYY-MM-DD, inclusive", value: selection.to ?? from })
        if (to === undefined || disposed) return
        next.from = from.trim()
        next.to = to.trim()
      }
      try {
        periodRange(next, options.sprint)
        await updateSelection(draft => {
          draft.period = next.period
          draft.from = next.from
          draft.to = next.to
        })
      } catch (error) {
        context.ui.toast.show({ title: "Cost period", message: error instanceof Error ? error.message : "Unable to save period", variant: "error" })
      }
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        { id: "standup.costs.period", title: "Costs: change period", group: "Costs", palette: true, slash: { name: "costs", arguments: true }, run: changePeriod },
        { id: "standup.costs.toggle", title: "Costs: collapse or expand", group: "Costs", palette: true, run: () => setCollapsed() },
        { id: "standup.costs.refresh", title: "Costs: refresh", group: "Costs", palette: true, run: refresh },
      ],
    }))
    const removeSidebar = context.ui.slot({
      append: "sidebar.content",
      render: props => <CostWidget
        state={state()}
        theme={context.theme}
        projectID={context.data.session.get(props.sessionID)?.projectID}
        collapsed={widgetPreferences.collapsed}
        toggleCollapsed={() => void setCollapsed()}
      />,
    })
    const removeFooter = context.ui.slot({
      append: "home.footer.status",
      render: () => <text fg={context.theme.text.muted}>
        {state().range.label}: {state().snapshot ? `${formatCost(state().snapshot!.total)}${state().error ? " (stale)" : ""}` : state().error ? "cost unavailable" : "loading costs…"}
      </text>,
    })
    createEffect(refresh)
    const interval = setInterval(refresh, options.refreshSeconds * 1000)
    const reconnect = context.data.on("server.connected", refresh)

    return () => {
      disposed = true
      clearInterval(interval)
      reconnect()
      monitor.dispose()
      removeSidebar()
      removeFooter()
    }
  },
})
