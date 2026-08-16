import { formatUsd } from "@/lib/ai/pricing";
import type { AiLimits } from "@/lib/ai/limits";

/**
 * Effective configuration, as the running process sees it.
 *
 * Read-only on purpose: every setting here comes from the environment, which
 * is the whole point — a value that could be changed from inside the app is
 * a value a compromised admin session could change. This page exists so an
 * admin can confirm what is actually configured without shell access.
 *
 * Secrets are reported as present or missing and never rendered.
 */

export interface SystemSetting {
  label: string;
  variable: string;
  value: string;
  /** Missing configuration that changes behaviour, e.g. mail silently not sending. */
  missing?: boolean;
}

export function AdminSystemPanel({
  limits,
  settings,
  secrets,
  adminEmails,
  environment,
}: {
  limits: AiLimits;
  settings: SystemSetting[];
  secrets: SystemSetting[];
  adminEmails: string[];
  environment: string;
}) {
  return (
    <>
      <section className="sq-panel">
        <div className="sq-section-head">
          <h2>Admins</h2>
          <span className="sq-sub">From ADMIN_EMAILS</span>
        </div>
        {adminEmails.length === 0 ? (
          <p className="sq-sub">
            No admin emails are configured, so the console is closed to everyone.
          </p>
        ) : (
          <ul className="sq-sub" style={{ margin: 0, paddingLeft: 18 }}>
            {adminEmails.map((email) => (
              <li key={email}>{email}</li>
            ))}
          </ul>
        )}
        <p className="sq-sub">
          The admin set changes with a deploy, never from inside the app — a compromised account
          cannot promote anyone.
        </p>
      </section>

      <section className="sq-panel">
        <div className="sq-section-head">
          <h2>AI spend caps</h2>
          <span className="sq-sub">Per day unless stated · resets midnight UTC</span>
        </div>
        <table className="sq-table">
          <thead>
            <tr>
              <th>Cap</th>
              <th>Value</th>
              <th>Variable</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Calls per user per minute</td>
              <td>{limits.userCallsPerMinute}</td>
              <td>
                <code>AI_USER_CALLS_PER_MINUTE</code>
              </td>
            </tr>
            <tr>
              <td>Calls per user per day</td>
              <td>{limits.userCallsPerDay.toLocaleString()}</td>
              <td>
                <code>AI_USER_CALLS_PER_DAY</code>
              </td>
            </tr>
            <tr>
              <td>Tokens per user per day</td>
              <td>{limits.userTokensPerDay.toLocaleString()}</td>
              <td>
                <code>AI_USER_TOKENS_PER_DAY</code>
              </td>
            </tr>
            <tr>
              <td>Spend per user per day</td>
              <td>{formatUsd(limits.userCostMicroUsdPerDay)}</td>
              <td>
                <code>AI_USER_USD_PER_DAY</code>
              </td>
            </tr>
            <tr>
              <td>Calls agency-wide per day</td>
              <td>{limits.globalCallsPerDay.toLocaleString()}</td>
              <td>
                <code>AI_GLOBAL_CALLS_PER_DAY</code>
              </td>
            </tr>
            <tr>
              <td>Spend agency-wide per day</td>
              <td>{formatUsd(limits.globalCostMicroUsdPerDay)}</td>
              <td>
                <code>AI_GLOBAL_USD_PER_DAY</code>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="sq-sub">
          Per-user caps do not apply to admins. The agency-wide caps apply to everyone.
        </p>
      </section>

      <section className="sq-panel">
        <div className="sq-section-head">
          <h2>Configuration</h2>
          <span className="sq-sub">{environment}</span>
        </div>
        <table className="sq-table">
          <thead>
            <tr>
              <th>Setting</th>
              <th>Value</th>
              <th>Variable</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((setting) => (
              <tr key={setting.variable}>
                <td>{setting.label}</td>
                <td>
                  {setting.missing ? (
                    <span className="sq-status-chip tone-amber">{setting.value}</span>
                  ) : (
                    setting.value
                  )}
                </td>
                <td>
                  <code>{setting.variable}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="sq-panel">
        <div className="sq-section-head">
          <h2>Credentials</h2>
          <span className="sq-sub">Presence only — values are never shown</span>
        </div>
        <table className="sq-table">
          <thead>
            <tr>
              <th>Credential</th>
              <th>State</th>
              <th>Variable</th>
            </tr>
          </thead>
          <tbody>
            {secrets.map((secret) => (
              <tr key={secret.variable}>
                <td>{secret.label}</td>
                <td>
                  <span className={`sq-status-chip ${secret.missing ? "tone-red" : "tone-green"}`}>
                    {secret.value}
                  </span>
                </td>
                <td>
                  <code>{secret.variable}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
