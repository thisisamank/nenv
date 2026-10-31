import { createContext, useContext } from "react";
import type { Resource } from "./use-resource.ts";
import type { Device, Me, Project } from "./types.ts";

export type AppData = {
  me: Me;
  projects: Resource<Project[]>;
  devices: Resource<Device[]>;
};

export const AppContext = createContext<AppData | null>(null);

export function useApp(): AppData {
  const data = useContext(AppContext);
  if (!data) throw new Error("useApp must be used inside the app");
  return data;
}

export function findProject(projects: Project[] | undefined, repo: string): Project | undefined {
  return projects?.find((project) => project.repo === repo);
}
