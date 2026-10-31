const UNITS: [number, string][] = [
  [60, "s"],
  [60, "m"],
  [24, "h"],
  [7, "d"],
  [4.35, "w"],
  [12, "mo"],
];

export function timeAgo(timestamp: string | null): string {
  if (!timestamp) return "never";
  let value = (Date.now() - Date.parse(`${timestamp.replace(" ", "T")}Z`)) / 1000;
  if (value < 60) return "just now";

  for (const [size, unit] of UNITS) {
    if (value < size) return `${Math.floor(value)}${unit} ago`;
    value /= size;
  }
  return `${Math.floor(value)}y ago`;
}

export function displayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

export function initials(email: string): string {
  const parts = displayName(email).split(" ");
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

export function avatarTone(email: string): number {
  let hash = 0;
  for (const char of email) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % 6) + 1;
}

export function environmentTone(name: string): "dev" | "staging" | "prod" | "" {
  if (/^prod/.test(name)) return "prod";
  if (/^(stag|preview|qa|test)/.test(name)) return "staging";
  if (/^(dev|local)/.test(name)) return "dev";
  return "";
}

const TONE_ORDER = ["dev", "staging", "", "prod"];

export function sortEnvironments<T extends { name: string }>(environments: T[]): T[] {
  return [...environments].sort(
    (a, b) => TONE_ORDER.indexOf(environmentTone(a.name)) - TONE_ORDER.indexOf(environmentTone(b.name)) || a.name.localeCompare(b.name),
  );
}

export function shortRepo(repo: string): string {
  return repo.split("/").slice(1).join("/");
}

export function capitalize(text: string): string {
  return text[0]!.toUpperCase() + text.slice(1);
}
