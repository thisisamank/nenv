import type { Policies } from "./types.ts";

export const DEFAULT_POLICIES: Policies = {
  dotenv: {
    mode: "warn",
    include: [".env", ".env.*"],
    exclude: [".env.example", ".env.sample", ".env.template", ".env.*.example"],
  },
  minCliVersion: null,
  sessionTtlHours: 168,
  environmentMinRole: "reader",
};
