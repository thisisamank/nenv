import { useEffect, useState } from "react";

export type Route =
  | { page: "overview" }
  | { page: "projects" }
  | { page: "project"; repo: string; environment?: string }
  | { page: "secret"; repo: string; environment: string; name: string }
  | { page: "team" }
  | { page: "policies"; repo?: string; environment?: string }
  | { page: "devices" }
  | { page: "join"; token: string }
  | { page: "activate"; code?: string };

export function href(route: Route): string {
  switch (route.page) {
    case "project":
      return `#/projects/${encodeURIComponent(route.repo)}${route.environment ? `/${route.environment}` : ""}`;
    case "secret":
      return `#/projects/${encodeURIComponent(route.repo)}/${route.environment}/${route.name}`;
    case "policies":
      return `#/policies${route.repo ? `/${encodeURIComponent(route.repo)}${route.environment ? `/${route.environment}` : ""}` : ""}`;
    case "join":
      return `#/join/${route.token}`;
    case "activate":
      return `#/activate${route.code ? `/${route.code}` : ""}`;
    case "overview":
      return "#/";
    default:
      return `#/${route.page}`;
  }
}

export function parse(hash: string): Route {
  const [section, repo, environment, name] = hash.replace(/^#\/?/, "").split("/");
  if (section === "projects" && repo && environment && name) {
    return { page: "secret", repo: decodeURIComponent(repo), environment, name };
  }
  if (section === "projects" && repo) {
    return { page: "project", repo: decodeURIComponent(repo), environment };
  }
  if (section === "join" && repo) {
    return { page: "join", token: repo };
  }
  if (section === "activate") {
    return { page: "activate", code: repo };
  }
  if (section === "policies") {
    return { page: "policies", repo: repo ? decodeURIComponent(repo) : undefined, environment };
  }
  if (section === "projects" || section === "team" || section === "devices") {
    return { page: section };
  }
  return { page: "overview" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const update = () => setRoute(parse(location.hash));
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return route;
}

export function navigate(route: Route): void {
  location.hash = href(route);
}
