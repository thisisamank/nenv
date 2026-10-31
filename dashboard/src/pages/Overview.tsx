import { api } from "../api.ts";
import { useApp } from "../app-context.ts";
import { AvatarStack } from "../components/Avatar.tsx";
import { EnvironmentList } from "../components/Environment.tsx";
import { ErrorLine, Loading, useToast } from "../components/Feedback.tsx";
import { Icon, type IconName } from "../components/Icon.tsx";
import { displayName, shortRepo, timeAgo } from "../format.ts";
import { href } from "../router.ts";
import type { Device, User } from "../types.ts";
import { useResource } from "../use-resource.ts";

type Alert = {
  key: string;
  tone: "bad" | "warn" | "info";
  icon: IconName;
  title: string;
  detail: string;
  action: { label: string; href?: string; onClick?: () => void };
};

export function Overview() {
  const { me, projects, devices } = useApp();
  const users = useResource(
    () => (me.isAdmin ? api<{ users: User[] }>("GET", "/v1/users").then((body) => body.users) : Promise.resolve([])),
    [me.isAdmin],
  );
  const notify = useToast();

  const copyInviteLink = () => {
    navigator.clipboard.writeText(location.origin);
    notify("Invite link copied");
  };
  const alerts = [...deviceAlerts(devices.data ?? []), ...userAlerts(users.data ?? [], copyInviteLink)];

  return (
    <>
      <div className="head">
        <h1>Overview</h1>
      </div>

      {me.isAdmin && (
        <section>
          <h2>Needs attention</h2>
          <div className="panel alerts">
            {devices.loading || users.loading ? (
              <Loading />
            ) : alerts.length === 0 ? (
              <div className="alert">
                <span className="alert-icon info">
                  <Icon name="shield" />
                </span>
                <div className="alert-text">
                  <b>All clear</b>
                  <span>Every device is compliant and every member has their keys</span>
                </div>
              </div>
            ) : (
              alerts.map((alert) => <AlertRow key={alert.key} alert={alert} />)
            )}
          </div>
        </section>
      )}

      <section>
        <h2>Projects</h2>
        <div className="panel">
          {projects.loading && !projects.data ? (
            <Loading />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Environments</th>
                  <th className="hide-sm">People</th>
                  <th className="hide-sm">Updated</th>
                </tr>
              </thead>
              <tbody>
                {projects.data?.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={4}>
                      No projects yet. <a href={href({ page: "projects" })}>Add one</a>
                    </td>
                  </tr>
                )}
                {projects.data?.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <a className="cell" href={href({ page: "project", repo: project.repo })}>
                        <Icon name="branch" />
                        <span className="mono">{shortRepo(project.repo)}</span>
                      </a>
                    </td>
                    <td>
                      <EnvironmentList names={project.environments.map((environment) => environment.name)} />
                    </td>
                    <td className="hide-sm">
                      <AvatarStack emails={project.members} />
                    </td>
                    <td className="hide-sm muted">{timeAgo(project.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <ErrorLine message={projects.error} />
        </div>
      </section>
    </>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  return (
    <div className="alert">
      <span className={`alert-icon ${alert.tone}`}>
        <Icon name={alert.icon} />
      </span>
      <div className="alert-text">
        <b>{alert.title}</b>
        <span>{alert.detail}</span>
      </div>
      {alert.action.href ? (
        <a className="btn sm" href={alert.action.href}>
          {alert.action.label}
        </a>
      ) : (
        <button className="btn sm" onClick={alert.action.onClick}>
          {alert.action.label}
        </button>
      )}
    </div>
  );
}

function deviceAlerts(devices: Device[]): Alert[] {
  const failing = devices.filter((device) => device.compliance.some((report) => !report.compliant));
  if (failing.length === 0) return [];

  const places = new Set(
    failing.flatMap((device) =>
      device.compliance.filter((report) => !report.compliant).map((report) => `${shortRepo(report.repo)} · ${report.environment}`),
    ),
  );
  return [
    {
      key: "devices",
      tone: "bad",
      icon: "file",
      title: `${failing.length} ${failing.length === 1 ? "device has" : "devices have"} blocked .env files`,
      detail: [...places].join(", "),
      action: { label: "Review", href: href({ page: "devices" }) },
    },
  ];
}

function userAlerts(users: User[], copyInviteLink: () => void): Alert[] {
  return users.flatMap((user): Alert[] => {
    const name = displayName(user.email);
    if (!user.hasPublicKey) {
      return [
        {
          key: `join-${user.id}`,
          tone: "info",
          icon: "mail",
          title: `${name} has not joined yet`,
          detail: `Invited ${timeAgo(user.createdAt)}`,
          action: { label: "Copy invite link", onClick: copyInviteLink },
        },
      ];
    }
    return user.projects
      .filter((project) => project.missingKeys.length > 0)
      .map((project) => ({
        key: `key-${user.id}-${project.repo}`,
        tone: "warn",
        icon: "key",
        title: `${name} is missing the ${project.missingKeys.join(", ")} ${project.missingKeys.length === 1 ? "key" : "keys"}`,
        detail: shortRepo(project.repo),
        action: { label: "Open project", href: href({ page: "project", repo: project.repo }) },
      }));
  });
}
