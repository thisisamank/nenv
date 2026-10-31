import { useState, type FormEvent } from "react";
import { api, repoPath } from "../api.ts";
import { useApp } from "../app-context.ts";
import { Avatar } from "../components/Avatar.tsx";
import { ErrorLine, Loading, useToast } from "../components/Feedback.tsx";
import { Icon } from "../components/Icon.tsx";
import { capitalize, displayName } from "../format.ts";
import { addToProject, announceInvite } from "../members.ts";
import type { Member, Project, Role } from "../types.ts";
import { errorMessage, useResource } from "../use-resource.ts";

const ROLES: Role[] = ["reader", "editor", "admin"];
const KEY_SHARING_NOTE = "Sharing keys from the browser needs device keys, which are not built yet. Use `nenv grant` for now.";

export function ProjectMembers({ project, environment }: { project: Project; environment: string }) {
  const { me, projects } = useApp();
  const notify = useToast();
  const members = useResource(
    () => api<{ members: Member[] }>("GET", `${repoPath(project.repo)}/members`).then((body) => body.members),
    [project.repo],
  );
  const canManage = project.role === "admin";

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      notify(success);
      members.reload();
      projects.reload();
    } catch (error) {
      notify(errorMessage(error), "bad");
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        Members
        <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
          {members.data?.length ?? ""}
        </span>
      </div>
      {canManage && <InviteForm project={project} canInviteNewUsers={me.isAdmin} onInvited={() => members.reload()} />}
      {members.loading && !members.data && <Loading />}
      <ErrorLine message={members.error} />
      <ul className="people">
        {members.data?.map((member) => (
          <li key={member.id}>
            <Avatar email={member.email} />
            <span className="grow" title={member.email}>
              {displayName(member.email)}
              <MemberStatus member={member} environment={environment} />
            </span>
            <select
              className="role"
              aria-label={`Role for ${member.email}`}
              value={member.role}
              disabled={!canManage}
              onChange={(event) =>
                run(
                  () => api("PUT", `${repoPath(project.repo)}/members/${member.id}`, { role: event.target.value }),
                  `${displayName(member.email)} is now ${event.target.value}`,
                )
              }
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {capitalize(role)}
                </option>
              ))}
            </select>
            {canManage && member.id === me.id && <span className="icon-btn" aria-hidden="true" />}
            {canManage && member.id !== me.id && (
              <button
                className="icon-btn"
                aria-label={`Remove ${member.email}`}
                onClick={() =>
                  confirm(`Remove ${member.email} from ${project.repo}?`) &&
                  run(() => api("DELETE", `${repoPath(project.repo)}/members/${member.id}`), `Removed ${member.email}`)
                }
              >
                <Icon name="x" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MemberStatus({ member, environment }: { member: Member; environment: string }) {
  if (!member.hasPasskey) {
    return (
      <span className="sub">
        <span className="pill">Invited</span>
      </span>
    );
  }
  if (!member.hasPublicKey) {
    return (
      <span className="sub">
        <span className="pill">No terminal yet</span>
      </span>
    );
  }
  if (!member.environments.includes(environment)) {
    return (
      <span className="sub">
        <button className="btn sm" disabled title={KEY_SHARING_NOTE}>
          <Icon name="key" />
          Share key
        </button>
      </span>
    );
  }
  return null;
}

function InviteForm({ project, canInviteNewUsers, onInvited }: { project: Project; canInviteNewUsers: boolean; onInvited: () => void }) {
  const notify = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await announceInvite(email, await addToProject(project.repo, email, role, canInviteNewUsers), notify);
      setEmail("");
      onInvited();
    } catch (error) {
      notify(errorMessage(error), "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="invite" onSubmit={submit}>
      <input type="email" placeholder="name@company.com" aria-label="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <div className="invite-row">
        <select aria-label="Role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {ROLES.map((option) => (
            <option key={option} value={option}>
              {capitalize(option)}
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={busy}>
          <Icon name="plus" />
          Invite
        </button>
      </div>
    </form>
  );
}
