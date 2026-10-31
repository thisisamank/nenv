import { DEFAULT_POLICIES, mergePolicies, type DotenvMode, type Policies as PolicySet, type Role } from "@nenv/policy";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { api, environmentPath, repoPath } from "../api.ts";
import { findProject, useApp } from "../app-context.ts";
import { ErrorLine, Loading, useToast } from "../components/Feedback.tsx";
import { Icon, type IconName } from "../components/Icon.tsx";
import { capitalize, shortRepo } from "../format.ts";
import { navigate } from "../router.ts";
import { errorMessage, useResource } from "../use-resource.ts";

type Layer = Partial<PolicySet>;

const MODES: { value: DotenvMode; title: string; detail: string; icon: IconName }[] = [
  { value: "warn", title: "Warn", detail: "Show a notice", icon: "bell" },
  { value: "block", title: "Block", detail: "Stop loading secrets", icon: "ban" },
  { value: "migrate", title: "Migrate", detail: "Ask to move into nenv", icon: "arrow" },
  { value: "delete", title: "Delete", detail: "Migrate, then remove", icon: "trash" },
];
const SESSION_OPTIONS = [24, 72, 168, 336, 720];

export function Policies({ repo, environment }: { repo?: string; environment?: string }) {
  const { me, projects } = useApp();
  const project = repo ? findProject(projects.data, repo) : undefined;
  const scopeKey = `${repo ?? ""}/${environment ?? ""}`;

  const layers = useResource(async () => {
    const organization = await api<{ policies: Layer }>("GET", "/v1/policies");
    const projectLayer = repo ? await api<{ policies: Layer }>("GET", `${repoPath(repo)}/policies`) : { policies: {} };
    const environmentLayer = repo && environment ? await api<{ policies: Layer }>("GET", `${environmentPath(repo, environment)}/policies`) : { policies: {} };
    return { organization: organization.policies, project: projectLayer.policies, environment: environmentLayer.policies };
  }, [scopeKey]);

  const canEdit = repo ? project?.role === "admin" : me.isAdmin;
  const basePath = repo ? (environment ? `${environmentPath(repo, environment)}/policies` : `${repoPath(repo)}/policies`) : "/v1/policies";

  return (
    <>
      <div className="head">
        <h1>Policies</h1>
      </div>

      <div className="scope">
        <select
          aria-label="Project"
          style={{ width: 190 }}
          value={repo ?? ""}
          onChange={(event) => navigate({ page: "policies", repo: event.target.value || undefined })}
        >
          <option value="">All projects</option>
          {projects.data?.map((candidate) => (
            <option key={candidate.repo} value={candidate.repo}>
              {shortRepo(candidate.repo)}
            </option>
          ))}
        </select>
        <Icon name="chev" />
        <select
          aria-label="Environment"
          style={{ width: 190 }}
          value={environment ?? ""}
          disabled={!project}
          onChange={(event) => navigate({ page: "policies", repo, environment: event.target.value || undefined })}
        >
          <option value="">All environments</option>
          {project?.environments.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>

      {layers.data ? (
        <ScopeForm
          key={scopeKey}
          effective={mergePolicies([layers.data.organization, layers.data.project, layers.data.environment])}
          basePath={basePath}
          canEdit={canEdit}
          repo={repo}
          environment={environment}
          onSaved={layers.reload}
        />
      ) : (
        <div className="panel">{layers.error ? <ErrorLine message={layers.error} /> : <Loading />}</div>
      )}

      {!repo && layers.data && (
        <OrganizationSettings key="organization" layer={layers.data.organization} canEdit={me.isAdmin} onSaved={layers.reload} />
      )}
    </>
  );
}

function ScopeForm({
  effective,
  basePath,
  canEdit,
  repo,
  environment,
  onSaved,
}: {
  effective: PolicySet;
  basePath: string;
  canEdit: boolean;
  repo?: string;
  environment?: string;
  onSaved: () => void;
}) {
  const notify = useToast();
  const [mode, setMode] = useState(effective.dotenv.mode);
  const [include, setInclude] = useState(effective.dotenv.include);
  const [exclude, setExclude] = useState(effective.dotenv.exclude);
  const [minRole, setMinRole] = useState<Role>(effective.environmentMinRole);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("PUT", `${basePath}/dotenv`, { value: { mode, include, exclude } });
      await api("PUT", `${basePath}/environmentMinRole`, { value: minRole });
      notify("Policy saved");
      onSaved();
    } catch (error) {
      notify(errorMessage(error), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      await api("DELETE", `${basePath}/dotenv`);
      await api("DELETE", `${basePath}/environmentMinRole`);
      notify("Policy reset to the inherited values");
      onSaved();
    } catch (error) {
      notify(errorMessage(error), "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <fieldset className="settings" disabled={!canEdit} style={{ border: 0 }}>
        <div className="field">
          <span>.env files</span>
          <div className="modes">
            {MODES.map((option) => (
              <label key={option.value} className={`mode${option.value === "delete" ? " destructive" : ""}`}>
                <input type="radio" name="mode" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} />
                <Icon name={option.icon} />
                <b>{option.title}</b>
                <span>{option.detail}</span>
              </label>
            ))}
          </div>
          {mode === "delete" && <Reach repo={repo} environment={environment} />}
        </div>

        <div className="form-grid">
          <div className="field">
            <span>Match</span>
            <Chips values={include} onChange={setInclude} label="Add file pattern" />
          </div>
          <div className="field">
            <span>Ignore</span>
            <Chips values={exclude} onChange={setExclude} label="Add ignored pattern" />
          </div>
          <label className="field">
            <span>Minimum role</span>
            <select value={minRole} onChange={(event) => setMinRole(event.target.value as Role)}>
              {(["reader", "editor", "admin"] as Role[]).map((role) => (
                <option key={role} value={role}>
                  {capitalize(role)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      {canEdit && (
        <div className="settings-foot">
          <button type="button" className="btn" onClick={reset} disabled={busy}>
            Reset
          </button>
          <button className={`btn ${mode === "delete" ? "danger" : "primary"}`} disabled={busy}>
            Save
          </button>
        </div>
      )}
    </form>
  );
}

function Reach({ repo, environment }: { repo?: string; environment?: string }) {
  const { devices } = useApp();
  const count = devices.data?.filter((device) =>
    device.compliance.some((report) => (!repo || report.repo === repo) && (!environment || report.environment === environment)),
  ).length;

  return (
    <div className="reach">
      <Icon name="alert" />
      {count ? `Removes .env files on ${count} ${count === 1 ? "device" : "devices"} after migration.` : "Removes .env files on developer devices after migration."}
    </div>
  );
}

function Chips({ values, onChange, label }: { values: string[]; onChange: (values: string[]) => void; label: string }) {
  const [draft, setDraft] = useState("");

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === "Enter" || event.key === ",") && draft.trim()) {
      event.preventDefault();
      if (!values.includes(draft.trim())) onChange([...values, draft.trim()]);
      setDraft("");
    } else if (event.key === "Backspace" && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className="chips">
      {values.map((value) => (
        <span key={value} className="chip">
          {value}
          <button type="button" className="icon-btn" style={{ width: 18, height: 18 }} aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((item) => item !== value))}>
            <Icon name="x" />
          </button>
        </span>
      ))}
      <input aria-label={label} placeholder="Add" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} />
    </div>
  );
}

function OrganizationSettings({ layer, canEdit, onSaved }: { layer: Layer; canEdit: boolean; onSaved: () => void }) {
  const notify = useToast();
  const [minCliVersion, setMinCliVersion] = useState(layer.minCliVersion ?? "");
  const [sessionTtlHours, setSessionTtlHours] = useState(layer.sessionTtlHours ?? DEFAULT_POLICIES.sessionTtlHours);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMinCliVersion(layer.minCliVersion ?? "");
    setSessionTtlHours(layer.sessionTtlHours ?? DEFAULT_POLICIES.sessionTtlHours);
  }, [layer]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("PUT", "/v1/policies/minCliVersion", { value: minCliVersion.trim() || null });
      await api("PUT", "/v1/policies/sessionTtlHours", { value: sessionTtlHours });
      notify("Organization settings saved");
      onSaved();
    } catch (error) {
      notify(errorMessage(error), "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 style={{ marginTop: 36 }}>Organization</h2>
      <form className="panel" onSubmit={save}>
        <fieldset className="settings form-grid" disabled={!canEdit} style={{ border: 0 }}>
          <label className="field">
            <span>Minimum CLI version</span>
            <input className="mono" placeholder="Any version" pattern="\d+\.\d+\.\d+" value={minCliVersion} onChange={(event) => setMinCliVersion(event.target.value)} />
          </label>
          <label className="field">
            <span>Session expiry</span>
            <select value={sessionTtlHours} onChange={(event) => setSessionTtlHours(Number(event.target.value))}>
              {[...new Set([...SESSION_OPTIONS, sessionTtlHours])].sort((a, b) => a - b).map((hours) => (
                <option key={hours} value={hours}>
                  {hours % 24 === 0 ? `${hours / 24} days` : `${hours} hours`}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {canEdit && (
          <div className="settings-foot">
            <button className="btn primary" disabled={busy}>
              Save
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
