import { ENV_VAR_NAME } from "@noenv/config/names";
import { useState, type FormEvent } from "react";
import { api, environmentPath } from "../api.ts";
import { findProject, useApp } from "../app-context.ts";
import { Avatar } from "../components/Avatar.tsx";
import { EnvironmentLabel } from "../components/Environment.tsx";
import { ErrorLine, Loading, useToast } from "../components/Feedback.tsx";
import { Icon } from "../components/Icon.tsx";
import { sealSecret } from "../crypto.ts";
import { shortRepo, timeAgo } from "../format.ts";
import { href, navigate } from "../router.ts";
import type { Project, VersionRow } from "../types.ts";
import { errorMessage, useResource } from "../use-resource.ts";
import { NEW_SECRET } from "./Project.tsx";

export function SecretPage({ repo, environment, name }: { repo: string; environment: string; name: string }) {
  const { projects } = useApp();
  const project = findProject(projects.data, repo);
  const isNew = name === NEW_SECRET;
  const history = useResource(
    () =>
      isNew
        ? Promise.resolve([])
        : api<{ versions: VersionRow[] }>("GET", `${environmentPath(repo, environment)}/secrets/${name}/versions`).then((body) => body.versions),
    [repo, environment, name],
  );

  if (!project) return projects.loading ? <Loading /> : <ErrorLine message={`No project for ${repo}.`} />;

  const latest = history.data?.[0]?.version ?? 0;
  return (
    <>
      <div className="crumb">
        <a href={href({ page: "projects" })}>Projects</a>
        <Icon name="chev" />
        <a href={href({ page: "project", repo })}>{shortRepo(repo)}</a>
        <Icon name="chev" />
        <a href={href({ page: "project", repo, environment })}>
          <EnvironmentLabel name={environment} />
        </a>
      </div>
      <div className="head">
        <h1 className="mono" style={{ fontSize: 19 }}>
          {isNew ? "New secret" : name}
        </h1>
      </div>

      <div className={isNew ? "" : "split history"}>
        <section>
          <ValueForm project={project} environment={environment} name={isNew ? null : name} nextVersion={latest + 1} onSaved={history.reload} />
        </section>
        {!isNew && (
          <aside className="card">
            <div className="card-head">History</div>
            {history.loading && !history.data ? <Loading /> : <History project={project} environment={environment} name={name} versions={history.data ?? []} onRestored={history.reload} />}
            <ErrorLine message={history.error} />
          </aside>
        )}
      </div>
    </>
  );
}

function ValueForm({
  project,
  environment,
  name,
  nextVersion,
  onSaved,
}: {
  project: Project;
  environment: string;
  name: string | null;
  nextVersion: number;
  onSaved: () => void;
}) {
  const { projects } = useApp();
  const notify = useToast();
  const [newName, setNewName] = useState("");
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const canWrite = project.role !== "reader";

  async function save(event: FormEvent) {
    event.preventDefault();
    const secretName = name ?? newName.trim();
    if (!ENV_VAR_NAME.test(secretName)) {
      setError("Use letters, digits, and underscores, starting with a letter or underscore.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const sealed = await sealSecret(project, environment, secretName, value);
      const saved = await api<{ version: number }>("PUT", `${environmentPath(project.repo, environment)}/secrets/${secretName}`, sealed);
      setValue("");
      notify(`Saved ${secretName} as v${saved.version}`);
      projects.reload();
      if (name) onSaved();
      else navigate({ page: "secret", repo: project.repo, environment, name: secretName });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <form className="editor" onSubmit={save}>
        {!name && (
          <label className="field">
            <span>Name</span>
            <input className="mono" placeholder="DATABASE_URL" value={newName} onChange={(event) => setNewName(event.target.value.toUpperCase())} required autoFocus />
          </label>
        )}
        <label className="field">
          <span>{name ? "New value" : "Value"}</span>
          <div className="reveal">
            <textarea
              placeholder="Paste value"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              style={visible ? undefined : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)}
              autoComplete="off"
              spellCheck={false}
              disabled={!canWrite}
              required
            />
            <button type="button" className="icon-btn" aria-label={visible ? "Hide value" : "Show value"} aria-pressed={visible} onClick={() => setVisible(!visible)}>
              <Icon name="eye" />
            </button>
          </div>
        </label>
        <ErrorLine message={error} />
        <div className="toolbar" style={{ margin: 0 }}>
          <span className="lock-line">
            <Icon name="lock" />
            Encrypted in your browser
          </span>
          <button className="btn primary" disabled={busy || !canWrite}>
            {name ? `Save as v${nextVersion}` : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function History({
  project,
  environment,
  name,
  versions,
  onRestored,
}: {
  project: Project;
  environment: string;
  name: string;
  versions: VersionRow[];
  onRestored: () => void;
}) {
  const notify = useToast();
  const canWrite = project.role !== "reader";

  async function restore(version: number) {
    try {
      const restored = await api<{ version: number }>("POST", `${environmentPath(project.repo, environment)}/secrets/${name}/rollback`, { version });
      notify(`Restored v${version} as v${restored.version}`);
      onRestored();
    } catch (error) {
      notify(errorMessage(error), "bad");
    }
  }

  return (
    <ul className="timeline">
      {versions.map((version, index) => (
        <li key={version.version} className={index === 0 ? "current" : ""}>
          <span className="node" />
          <div className="cell">
            <span className="version">v{version.version}</span>
            <Avatar email={version.author} />
            <span className="muted">{timeAgo(version.createdAt)}</span>
            {version.restoredFrom && <span className="pill">from v{version.restoredFrom}</span>}
          </div>
          {index === 0 ? (
            <span className="pill">Current</span>
          ) : (
            canWrite && (
              <button className="btn sm" onClick={() => restore(version.version)}>
                <Icon name="restore" />
                Restore
              </button>
            )
          )}
        </li>
      ))}
    </ul>
  );
}
