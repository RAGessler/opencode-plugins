import { Rpc } from "@opencode/plugin/rpc"
import { STATUS_SCHEMA } from "./view"

export const FollowupRpc = Rpc.define({
  id: "pr-followup",
  methods: {
    status: { input: { type: "object", additionalProperties: false }, output: STATUS_SCHEMA },
    setEnabled: {
      input: {
        type: "object",
        properties: { enabled: { type: "boolean" } },
        required: ["enabled"],
        additionalProperties: false,
      },
      output: STATUS_SCHEMA,
    },
  },
  events: {
    changed: { schema: { type: "object", additionalProperties: false } },
  },
})
