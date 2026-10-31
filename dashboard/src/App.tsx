import { api } from "./api.ts";
import { AppContext } from "./app-context.ts";
import { Loading, ToastProvider } from "./components/Feedback.tsx";
import { Layout } from "./components/Layout.tsx";
import { Devices } from "./pages/Devices.tsx";
import { Overview } from "./pages/Overview.tsx";
import { Policies } from "./pages/Policies.tsx";
import { ProjectPage } from "./pages/Project.tsx";
import { Projects } from "./pages/Projects.tsx";
import { SecretPage } from "./pages/Secret.tsx";
import { Team } from "./pages/Team.tsx";
import { useRoute, type Route } from "./router.ts";
import type { Device, Me, Project } from "./types.ts";
import { sortEnvironments } from "./format.ts";
import { useResource } from "./use-resource.ts";

const BROWSER_SESSION = "Dashboard";

export function App() {
  const route = useRoute();
  const me = useResource(() => api<Me>("GET", "/v1/me"), []);
  const projects = useResource(
    () =>
      api<{ projects: Project[] }>("GET", "/v1/projects").then((body) =>
        body.projects.map((project) => ({ ...project, environments: sortEnvironments(project.environments) })),
      ),
    [],
  );
  const devices = useResource(
    () =>
      me.data?.isAdmin
        ? api<{ devices: Device[] }>("GET", "/v1/devices").then((body) => body.devices.filter((device) => device.name !== BROWSER_SESSION))
        : Promise.resolve([]),
    [me.data?.isAdmin],
  );

  if (!me.data) {
    return <div className="boot">{me.error ? <p className="error-text">{me.error}</p> : <Loading label="Opening nenv" />}</div>;
  }

  const attention = (devices.data ?? []).filter((device) => device.compliance.some((report) => !report.compliant)).length;

  return (
    <AppContext.Provider value={{ me: me.data, projects, devices }}>
      <ToastProvider>
        <Layout me={me.data} route={route} attention={attention}>
          <Page route={route} />
        </Layout>
      </ToastProvider>
    </AppContext.Provider>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case "projects":
      return <Projects />;
    case "project":
      return <ProjectPage repo={route.repo} environment={route.environment} />;
    case "secret":
      return <SecretPage repo={route.repo} environment={route.environment} name={route.name} />;
    case "team":
      return <Team />;
    case "policies":
      return <Policies repo={route.repo} environment={route.environment} />;
    case "devices":
      return <Devices />;
    default:
      return <Overview />;
  }
}
