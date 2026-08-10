"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WorkspaceHeader } from "@/components/sq/workspace";
import type { AdminBoard, AdminCategory, AdminClient, AdminUser } from "@/lib/admin/queries";
import {
  adminClearBoardPassword,
  adminCreateCategory,
  adminDeleteCategory,
  adminUpdateCategory,
  adminCreateBoard,
  adminCreateClient,
  adminCreateUser,
  adminDeleteBoard,
  adminDeleteClient,
  adminDeleteUser,
  adminSetBoardMember,
  adminSetClientArchived,
  adminUpdateBoard,
  adminUpdateClient,
  adminUpdateUser,
  type AdminResult,
} from "@/actions/admin";

/**
 * One screen, three tables. Every destructive button asks for the row's own
 * name back before it fires, because a delete here takes boards and assets
 * with it (see `src/lib/admin/cascade.ts`).
 */

type Tab = "users" | "clients" | "boards" | "categories";

/** A delete only fires when the row's own name is typed back. */
function confirmName(name: string): boolean {
  const typed = window.prompt(`Type "${name}" to confirm this permanent delete.`);
  return typed?.trim() === name;
}

export function AdminConsole({
  currentUserId,
  users,
  clients,
  boards,
  categories,
}: {
  currentUserId: string;
  users: AdminUser[];
  clients: AdminClient[];
  boards: AdminBoard[];
  categories: AdminCategory[];
}) {
  const [tab, setTab] = useState<Tab>("users");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /** Every write funnels through here so success/failure reads the same way. */
  function run(action: () => Promise<AdminResult>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(successMessage);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="Admin" />

      <div className="sq-admin">
        <nav className="sq-admin-tabs">
          {(["users", "clients", "boards", "categories"] as Tab[]).map((name) => (
            <button
              key={name}
              type="button"
              className={`sq-pill${tab === name ? " amber" : ""}`}
              onClick={() => setTab(name)}
            >
              {name[0].toUpperCase() + name.slice(1)}
            </button>
          ))}
          {pending && <span className="sq-tiny">Saving…</span>}
        </nav>

        {tab === "users" && (
          <UsersPanel users={users} currentUserId={currentUserId} run={run} confirm={confirmName} />
        )}
        {tab === "clients" && <ClientsPanel clients={clients} run={run} confirm={confirmName} />}
        {tab === "boards" && (
          <BoardsPanel boards={boards} clients={clients} run={run} confirm={confirmName} />
        )}
        {tab === "categories" && (
          <CategoriesPanel
            categories={categories}
            boards={boards}
            run={run}
            confirm={confirmName}
          />
        )}
      </div>
    </main>
  );
}

type Run = (action: () => Promise<AdminResult>, successMessage: string) => void;
type Confirm = (name: string) => boolean;

// ── Users ──────────────────────────────────────────────────────────────────

function UsersPanel({
  users,
  currentUserId,
  run,
  confirm,
}: {
  users: AdminUser[];
  currentUserId: string;
  run: Run;
  confirm: Confirm;
}) {
  const [draft, setDraft] = useState({ name: "", email: "", password: "" });
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className="sq-panel">
      <div className="sq-section-head">
        <h2>Users</h2>
        <span className="sq-tiny">{users.length} accounts</span>
      </div>

      <form
        className="sq-admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => adminCreateUser(draft), "Account created");
          setDraft({ name: "", email: "", password: "" });
        }}
      >
        <input
          placeholder="Name"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <input
          type="email"
          placeholder="Email"
          value={draft.email}
          onChange={(event) => setDraft({ ...draft, email: event.target.value })}
        />
        <input
          type="password"
          placeholder="Password (8+ characters)"
          value={draft.password}
          onChange={(event) => setDraft({ ...draft, password: event.target.value })}
        />
        <button type="submit" className="sq-pill amber">
          Add user
        </button>
      </form>

      <table className="sq-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Boards</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((user) =>
            editing === user.id ? (
              <UserEditRow
                key={user.id}
                user={user}
                onCancel={() => setEditing(null)}
                onSave={(values) => {
                  run(() => adminUpdateUser(user.id, values), "Account updated");
                  setEditing(null);
                }}
              />
            ) : (
              <tr key={user.id}>
                <td>
                  {user.name}
                  {user.isAdmin && <span className="sq-tag">admin</span>}
                </td>
                <td>{user.email}</td>
                <td>{user.boardCount}</td>
                <td className="sq-row-actions">
                  <button type="button" onClick={() => setEditing(user.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={user.id === currentUserId}
                    title={
                      user.id === currentUserId ? "You cannot delete your own account" : undefined
                    }
                    onClick={() => {
                      if (!confirm(user.email)) return;
                      run(() => adminDeleteUser(user.id), "Account deleted");
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <p className="sq-tiny">
        Admins come from the <code>ADMIN_EMAILS</code> environment variable, not from this table.
      </p>
    </section>
  );
}

function UserEditRow({
  user,
  onSave,
  onCancel,
}: {
  user: AdminUser;
  onSave: (values: { name: string; email: string; password?: string }) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    name: user.name,
    email: user.email,
    password: "",
  });

  return (
    <tr>
      <td>
        <input
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
      </td>
      <td>
        <input
          value={values.email}
          onChange={(event) => setValues({ ...values, email: event.target.value })}
        />
      </td>
      <td>
        <input
          type="password"
          placeholder="New password (optional)"
          value={values.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />
      </td>
      <td className="sq-row-actions">
        <button type="button" onClick={() => onSave(values)}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

// ── Clients ────────────────────────────────────────────────────────────────

const EMPTY_CLIENT = {
  name: "",
  initials: "",
  color: "#d8b4fe",
  contact: "",
  cadence: "",
};

function ClientsPanel({
  clients,
  run,
  confirm,
}: {
  clients: AdminClient[];
  run: Run;
  confirm: Confirm;
}) {
  const [draft, setDraft] = useState(EMPTY_CLIENT);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className="sq-panel">
      <div className="sq-section-head">
        <h2>Clients</h2>
        <span className="sq-tiny">{clients.length} on the roster</span>
      </div>

      <form
        className="sq-admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => adminCreateClient(draft), "Client added");
          setDraft(EMPTY_CLIENT);
        }}
      >
        <input
          placeholder="Name"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <input
          placeholder="Initials"
          maxLength={2}
          value={draft.initials}
          onChange={(event) => setDraft({ ...draft, initials: event.target.value })}
        />
        <input
          type="color"
          value={draft.color}
          onChange={(event) => setDraft({ ...draft, color: event.target.value })}
        />
        <input
          placeholder="Account manager"
          value={draft.contact}
          onChange={(event) => setDraft({ ...draft, contact: event.target.value })}
        />
        <input
          placeholder="Cadence"
          value={draft.cadence}
          onChange={(event) => setDraft({ ...draft, cadence: event.target.value })}
        />
        <button type="submit" className="sq-pill amber">
          Add client
        </button>
      </form>

      <table className="sq-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Initials</th>
            <th>Contact</th>
            <th>Boards</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {clients.map((client) =>
            editing === client.id ? (
              <ClientEditRow
                key={client.id}
                client={client}
                onCancel={() => setEditing(null)}
                onSave={(values) => {
                  run(() => adminUpdateClient(client.id, values), "Client updated");
                  setEditing(null);
                }}
              />
            ) : (
              <tr key={client.id}>
                <td>
                  <span className="sq-dot" style={{ background: client.color }} />
                  {client.name}
                  {client.archivedAt && <span className="sq-tag">archived</span>}
                </td>
                <td>{client.initials}</td>
                <td>{client.contact ?? "—"}</td>
                <td>{client.boardCount}</td>
                <td className="sq-row-actions">
                  <button type="button" onClick={() => setEditing(client.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      run(
                        () => adminSetClientArchived(client.id, !client.archivedAt),
                        client.archivedAt ? "Client restored" : "Client archived",
                      )
                    }
                  >
                    {client.archivedAt ? "Restore" : "Archive"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(client.name)) return;
                      run(() => adminDeleteClient(client.id), "Client deleted");
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <p className="sq-tiny">
        Deleting a client also deletes its boards, assets, approvals, posts and communities. Archive
        instead when the work should stay readable.
      </p>
    </section>
  );
}

function ClientEditRow({
  client,
  onSave,
  onCancel,
}: {
  client: AdminClient;
  onSave: (values: typeof EMPTY_CLIENT) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    name: client.name,
    initials: client.initials,
    color: client.color,
    contact: client.contact ?? "",
    cadence: client.cadence ?? "",
  });

  return (
    <tr>
      <td>
        <input
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
      </td>
      <td>
        <input
          maxLength={2}
          value={values.initials}
          onChange={(event) => setValues({ ...values, initials: event.target.value })}
        />
      </td>
      <td>
        <input
          value={values.contact}
          onChange={(event) => setValues({ ...values, contact: event.target.value })}
        />
      </td>
      <td>
        <input
          type="color"
          value={values.color}
          onChange={(event) => setValues({ ...values, color: event.target.value })}
        />
      </td>
      <td className="sq-row-actions">
        <button type="button" onClick={() => onSave(values)}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

// ── Boards ─────────────────────────────────────────────────────────────────

function BoardsPanel({
  boards,
  clients,
  run,
  confirm,
}: {
  boards: AdminBoard[];
  clients: AdminClient[];
  run: Run;
  confirm: Confirm;
}) {
  const [draft, setDraft] = useState({ title: "", clientId: "", password: "" });
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className="sq-panel">
      <div className="sq-section-head">
        <h2>Boards</h2>
        <span className="sq-tiny">{boards.length} boards</span>
      </div>

      <form
        className="sq-admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => adminCreateBoard(draft), "Board created");
          setDraft({ title: "", clientId: "", password: "" });
        }}
      >
        <input
          placeholder="Title"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        <select
          value={draft.clientId}
          onChange={(event) => setDraft({ ...draft, clientId: event.target.value })}
        >
          <option value="">No client</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <input
          type="password"
          placeholder="Share password (optional)"
          value={draft.password}
          onChange={(event) => setDraft({ ...draft, password: event.target.value })}
        />
        <button type="submit" className="sq-pill amber">
          Add board
        </button>
      </form>

      <table className="sq-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Client</th>
            <th>Owner</th>
            <th>Members</th>
            <th>Tasks</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {boards.map((board) =>
            editing === board.id ? (
              <BoardEditRow
                key={board.id}
                board={board}
                clients={clients}
                onCancel={() => setEditing(null)}
                onSave={(values) => {
                  run(() => adminUpdateBoard(board.id, values), "Board updated");
                  setEditing(null);
                }}
              />
            ) : (
              <tr key={board.id}>
                <td>
                  {board.title}
                  {board.hasPassword && <span className="sq-tag">password</span>}
                </td>
                <td>{board.clientName ?? "—"}</td>
                <td>{board.ownerEmail ?? "—"}</td>
                <td>{board.memberCount}</td>
                <td>{board.taskCount}</td>
                <td className="sq-row-actions">
                  <button type="button" onClick={() => setEditing(board.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const email = window.prompt("Email of the account to add as a member");
                      if (!email) return;
                      run(() => adminSetBoardMember(board.id, email, true), "Member added");
                    }}
                  >
                    Add member
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const email = window.prompt("Email of the member to remove");
                      if (!email) return;
                      run(() => adminSetBoardMember(board.id, email, false), "Member removed");
                    }}
                  >
                    Remove member
                  </button>
                  {board.hasPassword && (
                    <button
                      type="button"
                      onClick={() =>
                        run(() => adminClearBoardPassword(board.id), "Password cleared")
                      }
                    >
                      Clear password
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(board.title)) return;
                      run(() => adminDeleteBoard(board.id), "Board deleted");
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <p className="sq-tiny">
        Deleting a board removes its tasks, comments, tags, contributors and columns. Assets made
        from those tasks survive, unlinked.
      </p>
    </section>
  );
}

function BoardEditRow({
  board,
  clients,
  onSave,
  onCancel,
}: {
  board: AdminBoard;
  clients: AdminClient[];
  onSave: (values: { title: string; clientId: string; password: string }) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    title: board.title,
    clientId: board.clientId ?? "",
    password: "",
  });

  return (
    <tr>
      <td>
        <input
          value={values.title}
          onChange={(event) => setValues({ ...values, title: event.target.value })}
        />
      </td>
      <td>
        <select
          value={values.clientId}
          onChange={(event) => setValues({ ...values, clientId: event.target.value })}
        >
          <option value="">No client</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </td>
      <td colSpan={3}>
        <input
          type="password"
          placeholder="New share password (optional)"
          value={values.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />
      </td>
      <td className="sq-row-actions">
        <button type="button" onClick={() => onSave(values)}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

// ── Task categories ────────────────────────────────────────────────────────

const EMPTY_CATEGORY = { boardId: "", name: "", color: "#d8b4fe", position: 0 };

/**
 * Categories replace the old built-in task types: a board only carries the
 * words its work actually uses, and an admin owns that list.
 */
function CategoriesPanel({
  categories,
  boards,
  run,
  confirm,
}: {
  categories: AdminCategory[];
  boards: AdminBoard[];
  run: Run;
  confirm: Confirm;
}) {
  const [draft, setDraft] = useState(EMPTY_CATEGORY);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className="sq-panel">
      <div className="sq-section-head">
        <h2>Task categories</h2>
        <span className="sq-tiny">{categories.length} across all boards</span>
      </div>

      <form
        className="sq-admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => adminCreateCategory(draft), "Category added");
          setDraft({ ...EMPTY_CATEGORY, boardId: draft.boardId });
        }}
      >
        <select
          aria-label="Board"
          value={draft.boardId}
          onChange={(event) => setDraft({ ...draft, boardId: event.target.value })}
        >
          <option value="">Pick a board</option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.title}
            </option>
          ))}
        </select>
        <input
          placeholder="Name"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <input
          type="color"
          value={draft.color}
          onChange={(event) => setDraft({ ...draft, color: event.target.value })}
        />
        <input
          type="number"
          min={0}
          aria-label="Order"
          value={draft.position}
          onChange={(event) => setDraft({ ...draft, position: Number(event.target.value) })}
        />
        <button type="submit" className="sq-pill amber">
          Add category
        </button>
      </form>

      <table className="sq-table">
        <thead>
          <tr>
            <th>Board</th>
            <th>Name</th>
            <th>Order</th>
            <th>Tasks</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {categories.map((category) =>
            editing === category.id ? (
              <CategoryEditRow
                key={category.id}
                category={category}
                onCancel={() => setEditing(null)}
                onSave={(values) => {
                  run(() => adminUpdateCategory(category.id, values), "Category updated");
                  setEditing(null);
                }}
              />
            ) : (
              <tr key={category.id}>
                <td>{category.boardTitle}</td>
                <td>
                  <span className="sq-dot" style={{ background: category.color }} />
                  {category.name}
                </td>
                <td>{category.position}</td>
                <td>{category.taskCount}</td>
                <td className="sq-row-actions">
                  <button type="button" onClick={() => setEditing(category.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(category.name)) return;
                      run(() => adminDeleteCategory(category.id), "Category deleted");
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <p className="sq-tiny">
        Deleting a category leaves its tasks in place — they just become uncategorized.
      </p>
    </section>
  );
}

function CategoryEditRow({
  category,
  onSave,
  onCancel,
}: {
  category: AdminCategory;
  onSave: (values: { name: string; color: string; position: number }) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    name: category.name,
    color: category.color,
    position: category.position,
  });

  return (
    <tr>
      <td>{category.boardTitle}</td>
      <td>
        <input
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
      </td>
      <td>
        <input
          type="number"
          min={0}
          aria-label="Order"
          value={values.position}
          onChange={(event) => setValues({ ...values, position: Number(event.target.value) })}
        />
      </td>
      <td>
        <input
          type="color"
          value={values.color}
          onChange={(event) => setValues({ ...values, color: event.target.value })}
        />
      </td>
      <td className="sq-row-actions">
        <button type="button" onClick={() => onSave(values)}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}
