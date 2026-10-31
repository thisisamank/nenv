import { useState, type FormEvent } from "react";
import { api, repoPath } from "../api.ts";
import { useApp } from "../app-context.ts";
import { Avatar } from "../components/Avatar.tsx";
import { ErrorLine, Loading, useToast } from "../components/Feedback.tsx";
import { Icon } from "../components/Icon.tsx";
import { capitalize, displayName, shortRepo } from "../format.ts";
import { addToProject, announceInvite } from "../members.ts";
import type { Role, User } from "../types.ts";
import { errorMessage, useResource } from "../use-resource.ts";

type TeamRow = { user: User; project: User["projects"][number] | null };

const ROLES: Role[] = ["reader", "editor", "admin"];
const KEY_SHARING_NOTE = "Sharing keys from the browser needs device keys, which are not built yet. Use `noenv grant` for now.";

export function Team() {
  const { projects } = useApp();
  const notify = useToast();
  const users = useResource(() => api<{ users: User[] }>("GET", "/v1/users").then((body) => body.users), []);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      notify(success);
      users.reload();
      projects.reload();
    } catch (error) {
      notify(errorMessage(error), "bad");
    }
  }

  const rows = (users.data ?? []).flatMap<TeamRow>((user) =>
    user.isAdmin || user.projects.length === 0 ? [{ user, project: null }] : user.projects.map((project) => ({ user, project })),
  );

  return (
    <>
      <div className="head">
        <h1>Team</h1>
        <InviteForm onInvited={users.reload} />
      </div>

      <div className="panel">
        {users.loading && !users.data ? (
          <Loading />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th className="hide-sm">Project</th>
                <th>Role</th>
                <th>Keys</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ user, project }) => (
                <tr key={`${user.id}-${project?.repo ?? "none"}`}>
                  <td>
                    <div className="cell">
                      <Avatar email={user.email} />
                      <div>
                        <div>
                          {displayName(user.email)} {user.isAdmin && <span className="pill">Org admin</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 12.5 }}>
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hide-sm">
                    <span className="mono muted">{project ? shortRepo(project.repo) : user.isAdmin ? "All projects" : "No projects"}</span>
                  </td>
                  <td>
                    {user.isAdmin && <span>Admin</span>}
                    {project && (
                      <select
                        aria-label={`Role for ${user.email} in ${project.repo}`}
                        style={{ height: 30, width: 110 }}
                        value={project.role}
                        onChange={(event) =>
                          run(
                            () => api("PUT", `${repoPath(project.repo)}/members/${user.id}`, { role: event.target.value }),
                            `${displayName(user.email)} is now ${event.target.value}`,
                          )
                        }
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {capitalize(role)}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <KeyStatus user={user} missing={project?.missingKeys ?? user.projects.flatMap((candidate) => candidate.missingKeys)} />
                  </td>
                  <td>
                    {project && (
                      <div className="row-actions">
                        <button
                          className="btn sm danger"
                          onClick={() =>
                            confirm(`Remove ${user.email} from ${project.repo}?`) &&
                            run(() => api("DELETE", `${repoPath(project.repo)}/members/${user.id}`), `Removed ${user.email}`)
                          }
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ErrorLine message={users.error} />
      </div>
    </>
  );
}

function KeyStatus({ user, missing }: { user: User; missing: string[] }) {
  if (!user.hasPasskey) return <span className="pill">Invited</span>;
  if (!user.hasPublicKey) return <span className="pill">No terminal yet</span>;
  if (missing.length === 0) return <span className="pill ok">All shared</span>;
  return (
    <button className="btn sm" disabled title={KEY_SHARING_NOTE}>
      <Icon name="key" />
      Share {missing.join(", ")}
    </button>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const { projects } = useApp();
  const notify = useToast();
  const [email, setEmail] = useState("");
  const [repo, setRepo] = useState("");
  const [role, setRole] = useState<Role>("reader");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const selected = repo || projects.data?.[0]?.repo || "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const inviteUrl = selected
        ? await addToProject(selected, email, role, true)
        : (await api<{ inviteUrl: string }>("POST", "/v1/users", { email })).inviteUrl;
      await announceInvite(email, inviteUrl, notify);
      setEmail("");
      onInvited();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <input type="email" placeholder="name@company.com" aria-label="Email" style={{ width: 220 }} value={email} onChange={(event) => setEmail(event.target.value)} required />
      <select aria-label="Project" style={{ width: 170 }} value={selected} onChange={(event) => setRepo(event.target.value)}>
        {projects.data?.map((project) => (
          <option key={project.repo} value={project.repo}>
            {shortRepo(project.repo)}
          </option>
        ))}
      </select>
      <select aria-label="Role" style={{ width: 110 }} value={role} onChange={(event) => setRole(event.target.value as Role)}>
        {ROLES.map((option) => (
          <option key={option} value={option}>
            {capitalize(option)}
          </option>
        ))}
      </select>
      <button className="btn primary" disabled={busy}>
        <Icon name="mail" />
        Invite
      </button>
      <ErrorLine message={error} />
    </form>
  );
}
