import { DEFAULT_POLICIES } from "./defaults.ts";
import type { Policies } from "./types.ts";

export function mergePolicies(layers: Partial<Policies>[]): Policies {
  return Object.assign({}, DEFAULT_POLICIES, ...layers);
}

export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}
