import type { Policies } from "@noenv/policy";
import { useState, type FormEvent } from "react";
import { api, environmentPath } from "../api.ts";
import { findProject, useApp } from "../app-context.ts";
import { Avatar } from "../components/Avatar.tsx";
import { ErrorLine, Loading, useToast } from "../components/Feedback.tsx";
import { Icon } from "../components/Icon.tsx";
import { createEnvironmentKeys } from "../crypto.ts";
import { capitalize, environmentTone, timeAgo } from "../format.ts";
import { href, navigate } from "../router.ts";
import type { Project, SecretRow } from "../types.ts";
import { errorMessage, useResource } from "../use-resource.ts";
import { ProjectMembers } from "./ProjectMembers.tsx";

export const NEW_SECRET = "~new";

export function ProjectPage({ repo, environment }: { repo: string; environment?: string }) {
  const { projects } = useApp();
  const project = findProject(projects.data, repo);

  if (!project) {
    return projects.loading ? <Loading /> : <ErrorLine message={`No project for ${repo}, or you are not a member.`} />;
  }

  const current = environment ?? project.environments[0]?.name;
  return (
    <>
      <div className="crumb">
        <a href={href({ page: "projects" })}>Projects</a>
        <Icon name="chev" />
      </div>
      <div className="head">
        <div className="title">
          <span className="title-icon">
            <Icon name="branch" />
          </span>
          <h1 className="mono" style={{ fontSize: 19 }}>
            {project.repo}
          </h1>
          <button className="icon-btn" aria-label="Copy repository" onClick={() => navigator.clipboard.writeText(project.repo)}>
            <Icon name="copy" />
          </button>
        </div>
      </div>

      <div className="toolbar">
        <EnvironmentTabs project={project} current={current} />
      </div>

      <div className="split">
        <section>{current ? <Secrets project={project} environment={current} /> : <NoEnvironment />}</section>
        <aside style={{ display: "grid", gap: 20 }}>
          <ProjectMembers project={project} environment={current ?? ""} />
          {current && <PolicyCard project={project} environment={current} />}
        </aside>
      </div>
    </>
  );
}

function EnvironmentTabs({ project, current }: { project: Project; current: string | undefined }) {
  const { me, projects } = useApp();
  const notify = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      if (!me.publicKey) {
        throw new Error("Sign in with the noenv CLI once so noenv can create your key.");
      }
      await api("POST", environmentPath(project.repo, name), await createEnvironmentKeys(me.publicKey));
      setAdding(false);
      setName("");
      projects.reload();
      navigate({ page: "project", repo: project.repo, environment: name });
    } catch (error) {
      notify(errorMessage(error), "bad");
    }
  }

  return (
    <nav className="seg" aria-label="Environments">
      {project.environments.map((environment) => (
        <a
          key={environment.name}
          href={href({ page: "project", repo: project.repo, environment: environment.name })}
          aria-current={environment.name === current ? "page" : undefined}
        >
          <span className={`env ${environmentTone(environment.name)}`} />
          {environment.name}
        </a>
      ))}
      {project.role === "admin" &&
        (adding ? (
          <form onSubmit={create} style={{ display: "flex", gap: 4 }}>
            <input
              autoFocus
              aria-label="Environment name"
              placeholder="staging"
              pattern="[A-Za-z0-9_-]+"
              value={name}
              onChange={(event) => setName(event.target.value)}
              style={{ height: 30, width: 130 }}
              required
            />
            <button className="btn sm primary">Create</button>
          </form>
        ) : (
          <a className="add" href="#" aria-label="Add environment" onClick={(event) => (event.preventDefault(), setAdding(true))}>
            <Icon name="plus" />
          </a>
        ))}
    </nav>
  );
}

function Secrets({ project, environment }: { project: Project; environment: string }) {
  const [query, setQuery] = useState("");
  const secrets = useResource(
    () => api<{ secrets: SecretRow[] }>("GET", `${environmentPath(project.repo, environment)}/secrets`).then((body) => body.secrets),
    [project.repo, environment],
  );
  const canWrite = project.role !== "reader";
  const visible = secrets.data?.filter((secret) => secret.name.toLowerCase().includes(query.toLowerCase()));
  const secretHref = (name: string) => href({ page: "secret", repo: project.repo, environment, name });

  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Icon name="search" />
          <input type="search" placeholder="Search secrets" aria-label="Search secrets" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        {canWrite && (
          <a className="btn primary" href={secretHref(NEW_SECRET)}>
            <Icon name="plus" />
            New secret
          </a>
        )}
      </div>
      <div className="panel">
        {secrets.loading && !secrets.data ? (
          <Loading />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th className="hide-sm">Value</th>
                <th>Version</th>
                <th className="hide-sm">Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible?.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={5}>{query ? "No secrets match" : "No secrets yet"}</td>
                </tr>
              )}
              {visible?.map((secret) => (
                <tr key={secret.name}>
                  <td>
                    <a className="mono" href={secretHref(secret.name)}>
                      {secret.name}
                    </a>
                  </td>
                  <td className="hide-sm">
                    <span className="masked">••••••••••••</span>
                  </td>
                  <td>
                    <span className="version">v{secret.version}</span>
                  </td>
                  <td className="hide-sm">
                    <div className="cell">
                      <Avatar email={secret.author} />
                      <span className="muted">{timeAgo(secret.updatedAt)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="row-actions">
                      {canWrite && (
                        <a className="btn sm" href={secretHref(secret.name)}>
                          Edit
                        </a>
                      )}
                      <a className="btn sm" href={secretHref(secret.name)}>
                        History
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ErrorLine message={secrets.error} />
      </div>
    </>
  );
}

const MODE_TONE: Record<string, string> = { warn: "", block: "warn", migrate: "warn", delete: "bad" };

function PolicyCard({ project, environment }: { project: Project; environment: string }) {
  const policy = useResource(
    () => api<{ effective: Policies }>("GET", `${environmentPath(project.repo, environment)}/policies`).then((body) => body.effective),
    [project.repo, environment],
  );

  return (
    <div className="card">
      <div className="card-head">
        Policy
        <a href={href({ page: "policies", repo: project.repo, environment })}>Edit</a>
      </div>
      {policy.data ? (
        <ul className="kv">
          <li>
            <span className="muted">.env files</span>
            <span className={`pill ${MODE_TONE[policy.data.dotenv.mode]}`}>{capitalize(policy.data.dotenv.mode)}</span>
          </li>
          <li>
            <span className="muted">Min. role</span>
            <span>{capitalize(policy.data.environmentMinRole)}</span>
          </li>
        </ul>
      ) : (
        <Loading />
      )}
    </div>
  );
}

function NoEnvironment() {
  return (
    <div className="panel">
      <p className="state-line">No environments yet. Use + to create the first one.</p>
    </div>
  );
}
