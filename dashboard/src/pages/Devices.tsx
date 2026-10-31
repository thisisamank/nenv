import { compareVersions, mergePolicies, type Policies } from "@noenv/policy";
import { useState } from "react";
import { api } from "../api.ts";
import { useApp } from "../app-context.ts";
import { Avatar } from "../components/Avatar.tsx";
import { ErrorLine, Loading, useToast } from "../components/Feedback.tsx";
import { Icon } from "../components/Icon.tsx";
import { displayName, shortRepo, timeAgo } from "../format.ts";
import type { Device } from "../types.ts";
import { errorMessage, useResource } from "../use-resource.ts";

export function Devices() {
  const { devices } = useApp();
  const notify = useToast();
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const policies = useResource(
    () => api<{ policies: Partial<Policies> }>("GET", "/v1/policies").then((body) => mergePolicies([body.policies])),
    [],
  );

  const minVersion = policies.data?.minCliVersion ?? null;
  const needsAttention = (device: Device) =>
    device.compliance.some((report) => !report.compliant) || isOutdated(device.cliVersion, minVersion);
  const visible = (devices.data ?? []).filter((device) => filter === "all" || needsAttention(device));

  async function signOut(device: Device) {
    if (!confirm(`Sign out ${device.name} (${device.email})? It stops loading secrets until they sign in again.`)) return;
    try {
      await api("DELETE", `/v1/devices/${device.id}`);
      notify(`Signed out ${device.name}`);
      devices.reload();
    } catch (error) {
      notify(errorMessage(error), "bad");
    }
  }

  return (
    <>
      <div className="head">
        <h1>Devices</h1>
        <nav className="seg" aria-label="Filter">
          <button className="link-btn" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All
          </button>
          <button className="link-btn" aria-pressed={filter === "attention"} onClick={() => setFilter("attention")}>
            Needs attention
          </button>
        </nav>
      </div>

      <div className="panel">
        {devices.loading && !devices.data ? (
          <Loading />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Device</th>
                <th>CLI</th>
                <th className="hide-sm">Last seen</th>
                <th>.env files</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={6}>{filter === "all" ? "No signed-in devices" : "Nothing needs attention"}</td>
                </tr>
              )}
              {visible.map((device) => (
                <tr key={device.id}>
                  <td>
                    <div className="cell">
                      <Avatar email={device.email} />
                      <span>{displayName(device.email)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="cell">
                      <Icon name="laptop" />
                      <span className="mono">{device.name}</span>
                    </div>
                  </td>
                  <td>{device.cliVersion ? <span className={`pill ${isOutdated(device.cliVersion, minVersion) ? "warn" : ""}`}>{device.cliVersion}</span> : <span className="faint">—</span>}</td>
                  <td className="hide-sm muted">{timeAgo(device.lastSeenAt)}</td>
                  <td>
                    <DotenvStatus device={device} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn sm danger" onClick={() => signOut(device)}>
                        Sign out
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ErrorLine message={devices.error} />
      </div>
    </>
  );
}

function DotenvStatus({ device }: { device: Device }) {
  const failing = device.compliance.flatMap((report) =>
    report.compliant ? [] : report.files.filter((file) => file.status !== "deleted").map((file) => `${shortRepo(report.repo)}/${file.path}`),
  );
  if (failing.length > 0) {
    return (
      <div className="envs">
        {failing.map((file) => (
          <span key={file} className="pill bad">
            {file}
          </span>
        ))}
      </div>
    );
  }
  return device.compliance.length > 0 ? <span className="pill ok">Clean</span> : <span className="faint">—</span>;
}

function isOutdated(version: string | null, minimum: string | null): boolean {
  return Boolean(version && minimum && compareVersions(version, minimum) < 0);
}
