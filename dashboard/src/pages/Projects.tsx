import { normalizeRemoteUrl } from "@noenv/config/repo";
import { useState, type FormEvent } from "react";
import { api, environmentPath } from "../api.ts";
import { useApp } from "../app-context.ts";
import { AvatarStack } from "../components/Avatar.tsx";
import { EnvironmentList } from "../components/Environment.tsx";
import { ErrorLine, Loading } from "../components/Feedback.tsx";
import { Icon } from "../components/Icon.tsx";
import { createEnvironmentKeys } from "../crypto.ts";
import { href, navigate } from "../router.ts";
import { errorMessage } from "../use-resource.ts";

const FIRST_ENVIRONMENT = "development";

export function Projects() {
  const { me, projects } = useApp();
  const [remote, setRemote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function addProject(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const repo = normalizeRemoteUrl(remote);
      await api("POST", "/v1/projects", { name: repo.split("/").at(-1), repo });
      if (me.publicKey) {
        await api("POST", environmentPath(repo, FIRST_ENVIRONMENT), await createEnvironmentKeys(me.publicKey));
      }
      projects.reload();
      navigate({ page: "project", repo });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="head">
        <h1>Projects</h1>
        {me.isAdmin && (
          <form className="inline-form" onSubmit={addProject}>
            <input
              type="text"
              size={36}
              placeholder="Paste a git remote"
              aria-label="Git remote"
              value={remote}
              onChange={(event) => setRemote(event.target.value)}
              required
            />
            <button className="btn primary" disabled={busy}>
              <Icon name="plus" />
              Add project
            </button>
          </form>
        )}
      </div>
      <ErrorLine message={error} />

      <div className="panel">
        {projects.loading && !projects.data ? (
          <Loading />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Repository</th>
                <th>Environments</th>
                <th className="right hide-sm">Secrets</th>
                <th className="hide-sm">People</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.data?.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={5}>No projects yet</td>
                </tr>
              )}
              {projects.data?.map((project) => {
                const link = href({ page: "project", repo: project.repo });
                return (
                  <tr key={project.id}>
                    <td>
                      <a className="cell" href={link}>
                        <Icon name="branch" />
                        <span className="mono">{project.repo}</span>
                      </a>
                    </td>
                    <td>
                      <EnvironmentList names={project.environments.map((environment) => environment.name)} />
                    </td>
                    <td className="right hide-sm">{project.secretCount}</td>
                    <td className="hide-sm">
                      <AvatarStack emails={project.members} />
                    </td>
                    <td className="right">
                      <a className="icon-btn" href={link} aria-label={`Open ${project.repo}`}>
                        <Icon name="chev" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <ErrorLine message={projects.error} />
      </div>
    </>
  );
}
