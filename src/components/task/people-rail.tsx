"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Building2, UserRound, UsersRound } from "lucide-react";
import { setTaskClient, setTaskPeopleByUser, type PeopleRole } from "@/actions/task-workspace";

interface Person {
  id: string;
  name: string;
  /** The account behind this board row, when it has one. */
  userId?: string | null;
}

/** An account that can be staffed onto work. */
export interface BoardPerson {
  userId: string;
  name: string;
  email: string;
  contributorId: string | null;
}

/**
 * The four people questions every task answers: who owns it, who works on it,
 * who signs it off, and whose brand it is. All three person roles are the same
 * control, because the difference between them is meaning, not mechanics.
 */
export function PeopleRail({
  taskId,
  people,
  assignees,
  collaborators,
  stakeholders,
  clients,
  clientId,
}: {
  taskId: string;
  people: BoardPerson[];
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
        people={people}
        selected={assignees}
        single
        icon={<UserRound aria-hidden="true" />}
      />
      <PeopleField
        taskId={taskId}
        kind="collaborator"
        label="Collaborators"
        hint="Working on it"
        people={people}
        selected={collaborators}
        icon={<UsersRound aria-hidden="true" />}
      />
      <PeopleField
        taskId={taskId}
        kind="stakeholder"
        label="Stakeholders"
        hint="Sign it off"
        people={people}
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
  people,
  selected,
  single = false,
  icon,
}: {
  taskId: string;
  kind: PeopleRole;
  label: string;
  hint: string;
  people: BoardPerson[];
  selected: Person[];
  /** An assignee is one person; the other roles are sets. */
  single?: boolean;
  icon: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Selection is tracked by account, because that is what the picker offers
  // and what the action writes; the contributor row is an implementation detail.
  const chosen = new Set(
    selected.map((person) => person.userId ?? person.id).filter(Boolean) as string[],
  );

  const commit = (ids: string[]) => {
    startTransition(async () => {
      await setTaskPeopleByUser(taskId, kind, ids);
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
          {people.map((person) => (
            <button
              key={person.userId}
              type="button"
              role="option"
              aria-selected={chosen.has(person.userId)}
              className={`sq-people-option${chosen.has(person.userId) ? " is-on" : ""}`}
              onClick={() => toggle(person.userId)}
              title={person.email}
            >
              <span className="sq-avatar sq-avatar-sm">{initials(person.name)}</span>
              {person.name}
            </button>
          ))}
          {!people.length && <p className="sq-sub">No accounts yet. Invite someone first.</p>}
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
