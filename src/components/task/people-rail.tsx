"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Building2, UserRound, UsersRound } from "lucide-react";
import { setTaskClient, setTaskPeople, type PeopleRole } from "@/actions/task-workspace";

interface Person {
  id: string;
  name: string;
}

/**
 * The four people questions every task answers: who owns it, who works on it,
 * who signs it off, and whose brand it is. All three person roles are the same
 * control, because the difference between them is meaning, not mechanics.
 */
export function PeopleRail({
  taskId,
  contributors,
  assignees,
  collaborators,
  stakeholders,
  clients,
  clientId,
}: {
  taskId: string;
  contributors: Person[];
  assignees: Person[];
  collaborators: Person[];
  stakeholders: Person[];
  clients: { id: string; name: string }[];
  clientId: string | null;
}) {
  return (
    <div className="sq-people">
      <div className="sq-people-head">
        <div className="sq-eyebrow">Ownership</div>
        <h3>Task team</h3>
        <p className="sq-sub">Make it obvious who moves the work and who approves it.</p>
      </div>
      <PeopleField
        taskId={taskId}
        kind="assignee"
        label="Assignee"
        hint="Owns the task"
        contributors={contributors}
        selected={assignees}
        single
        icon={<UserRound aria-hidden="true" />}
      />
      <PeopleField
        taskId={taskId}
        kind="collaborator"
        label="Collaborators"
        hint="Working on it"
        contributors={contributors}
        selected={collaborators}
        icon={<UsersRound aria-hidden="true" />}
      />
      <PeopleField
        taskId={taskId}
        kind="stakeholder"
        label="Stakeholders"
        hint="Sign it off"
        contributors={contributors}
        selected={stakeholders}
        icon={<BadgeCheck aria-hidden="true" />}
      />
      <ClientField taskId={taskId} clients={clients} clientId={clientId} />
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function PeopleField({
  taskId,
  kind,
  label,
  hint,
  contributors,
  selected,
  single = false,
  icon,
}: {
  taskId: string;
  kind: PeopleRole;
  label: string;
  hint: string;
  contributors: Person[];
  selected: Person[];
  /** An assignee is one person; the other roles are sets. */
  single?: boolean;
  icon: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const chosen = new Set(selected.map((person) => person.id));

  const commit = (ids: string[]) => {
    startTransition(async () => {
      await setTaskPeople(taskId, kind, ids);
      router.refresh();
    });
  };

  const toggle = (id: string) => {
    if (single) {
      commit(chosen.has(id) ? [] : [id]);
      setOpen(false);
      return;
    }
    commit(chosen.has(id) ? [...chosen].filter((entry) => entry !== id) : [...chosen, id]);
  };

  return (
    <div className="sq-field sq-people-field">
      <label className="sq-people-field-label">
        <span className="sq-people-label-icon">{icon}</span>
        <span>
          <b>{label}</b>
          <small>{hint}</small>
        </span>
      </label>

      <button
        type="button"
        className="sq-fieldbox sq-people-trigger"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
      >
        {selected.length ? (
          <span className="sq-people-chips">
            {selected.map((person) => (
              <span key={person.id} className="sq-avatar sq-avatar-sm" title={person.name}>
                {initials(person.name)}
              </span>
            ))}
            <span className="sq-people-names">
              {selected.map((person) => person.name).join(", ")}
            </span>
          </span>
        ) : (
          <span className="sq-sub">Nobody yet</span>
        )}
      </button>

      {open && (
        <div className="sq-people-menu" role="listbox">
          {contributors.map((person) => (
            <button
              key={person.id}
              type="button"
              role="option"
              aria-selected={chosen.has(person.id)}
              className={`sq-people-option${chosen.has(person.id) ? " is-on" : ""}`}
              onClick={() => toggle(person.id)}
            >
              <span className="sq-avatar sq-avatar-sm">{initials(person.name)}</span>
              {person.name}
            </button>
          ))}
          {!contributors.length && <p className="sq-sub">Add people to this board first.</p>}
        </div>
      )}
    </div>
  );
}

function ClientField({
  taskId,
  clients,
  clientId,
}: {
  taskId: string;
  clients: { id: string; name: string }[];
  clientId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="sq-field sq-people-field">
      <label htmlFor="task-client" className="sq-people-field-label">
        <span className="sq-people-label-icon">
          <Building2 aria-hidden="true" />
        </span>
        <span>
          <b>Client</b>
          <small>Whose brand it is</small>
        </span>
      </label>
      <select
        id="task-client"
        className="sq-fieldbox"
        value={clientId ?? ""}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value || null;
          startTransition(async () => {
            await setTaskClient(taskId, next);
            router.refresh();
          });
        }}
      >
        <option value="">No client</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </div>
  );
}
