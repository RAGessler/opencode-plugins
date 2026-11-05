import type { CostSnapshot } from "./costs"
import type { PeriodRange } from "./periods"

export interface CostState {
  range: PeriodRange
  snapshot?: CostSnapshot
  loading: boolean
  error?: string
}

type Loader = (range: PeriodRange, signal: AbortSignal) => Promise<CostSnapshot>
const key = (range: PeriodRange) => `${range.from}:${range.to}:${range.label}`

/** Owns one replaceable snapshot, including cancellation and stale responses. */
export function createCostMonitor(load: Loader, publish: (state: CostState) => void) {
  let state: CostState | undefined
  let active: { key: string; abort: AbortController; promise: Promise<void> } | undefined
  let generation = 0
  let disposed = false

  function refresh(range: PeriodRange): Promise<void> {
    if (disposed) return Promise.resolve()
    const identity = key(range)
    if (active?.key === identity) return active.promise
    active?.abort.abort()
    const abort = new AbortController()
    const ownGeneration = ++generation
    state = { range, loading: true, snapshot: state && key(state.range) === identity ? state.snapshot : undefined }
    publish(state)
    const promise = Promise.resolve().then(() => load(range, AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)])))
      .then(snapshot => {
        if (disposed || ownGeneration !== generation) return
        state = { range, snapshot, loading: false }
        publish(state)
      }).catch(() => {
        if (disposed || ownGeneration !== generation) return
        state = { range, snapshot: state?.snapshot, loading: false, error: "Cost data unavailable" }
        publish(state)
      }).finally(() => {
        if (ownGeneration === generation) active = undefined
      })
    active = { key: identity, abort, promise }
    return promise
  }

  return {
    refresh,
    dispose() {
      disposed = true
      generation++
      active?.abort.abort()
      active = undefined
    },
  }
}
