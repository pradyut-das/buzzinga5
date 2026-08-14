"use client";

import { Archive, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { adminDeleteClient, adminSetClientArchived, adminUpdateClient } from "@/actions/admin";
import { ModalShell, modalInputClass, modalLabelClass } from "@/components/reference/modal-shell";

export interface ClientEditable {
  id: string;
  name: string;
  initials: string;
  color: string;
  contact: string | null;
  cadence: string | null;
  archived?: boolean;
}

const cancelClass =
  "h-11 rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink transition hover:bg-slate-50";
const submitClass =
  "h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[#e6a200] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Edit, archive and delete for one client. Admin-only — the page decides
 * whether to render it, and the actions behind it call `requireAdmin()` again
 * so the gate does not live only in the UI.
 *
 * Delete is irreversible and takes the client's boards, tasks and docs with it,
 * so it asks for the name to be typed before it will run.
 */
export function ClientActions({
  client,
  accounts = [],
}: {
  client: ClientEditable;
  /** Real accounts, offered as the contact rather than a typed-in name. */
  accounts?: { id: string; name: string; email: string }[];
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(client.name);
  const [initials, setInitials] = useState(client.initials);
  const [color, setColor] = useState(client.color);
  const [contact, setContact] = useState(client.contact ?? "");
  const [cadence, setCadence] = useState(client.cadence ?? "");
  const [confirmName, setConfirmName] = useState("");

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const run = (work: () => Promise<{ success: boolean; error?: string }>, done: () => void) =>
    startTransition(async () => {
      const result = await work();
      if (!result.success) {
        toast.error(result.error ?? "That did not work");
        return;
      }
      done();
    });

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        aria-label="Client actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white text-ink shadow-soft transition hover:bg-slate-50"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-[14px] border border-line bg-white py-1 shadow-modal"
        >
          <MenuRow
            Icon={Pencil}
            label="Edit client"
            onClick={() => {
              setMenuOpen(false);
              setEditing(true);
            }}
          />
          <MenuRow
            Icon={Archive}
            label={client.archived ? "Restore client" : "Archive client"}
            onClick={() => {
              setMenuOpen(false);
              run(
                () => adminSetClientArchived(client.id, !client.archived),
                () => {
                  toast.success(client.archived ? "Client restored" : "Client archived");
                  router.refresh();
                },
              );
            }}
          />
          <MenuRow
            Icon={Trash2}
            label="Delete client"
            tone="danger"
            onClick={() => {
              setMenuOpen(false);
              setConfirmName("");
              setDeleting(true);
            }}
          />
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => adminUpdateClient(client.id, { name, initials, color, contact, cadence }),
            () => {
              setEditing(false);
              toast.success("Client updated");
              router.refresh();
            },
          );
        }}
      >
        <ModalShell
          open={editing}
          onClose={() => !pending && setEditing(false)}
          title="Edit client"
          description="Update how this account appears across the desk."
          footer={
            <>
              <button
                type="button"
                className={cancelClass}
                onClick={() => setEditing(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button type="submit" className={submitClass} disabled={pending}>
                {pending ? "Saving…" : "Save client"}
              </button>
            </>
          }
        >
          <div className="grid gap-5 sm:grid-cols-[1fr_120px]">
            <label>
              <span className={modalLabelClass}>Client name</span>
              <input
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={modalInputClass}
              />
            </label>
            <label>
              <span className={modalLabelClass}>Initials</span>
              <input
                required
                maxLength={2}
                value={initials}
                onChange={(event) => setInitials(event.target.value.toUpperCase())}
                className={modalInputClass}
              />
            </label>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_120px]">
            <label>
              <span className={modalLabelClass}>Contact</span>
              <input
                list="client-contact-accounts"
                maxLength={160}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder={accounts.length ? "Pick an account, or type one" : "Name or email"}
                className={modalInputClass}
              />
              <datalist id="client-contact-accounts">
                {accounts.map((account) => (
                  <option key={account.id} value={account.email}>
                    {account.name}
                  </option>
                ))}
              </datalist>
            </label>
            <label>
              <span className={modalLabelClass}>Color</span>
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className={`${modalInputClass} cursor-pointer p-1.5`}
              />
            </label>
          </div>
          <label className="mt-5 block">
            <span className={modalLabelClass}>Cadence</span>
            <input
              maxLength={400}
              value={cadence}
              onChange={(event) => setCadence(event.target.value)}
              placeholder="What this client expects, and how often"
              className={modalInputClass}
            />
          </label>
        </ModalShell>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => adminDeleteClient(client.id),
            () => {
              setDeleting(false);
              toast.success("Client deleted");
              router.push("/clients");
            },
          );
        }}
      >
        <ModalShell
          open={deleting}
          onClose={() => !pending && setDeleting(false)}
          title="Delete client"
          description="This removes the client and every board, task and doc under it. It cannot be undone."
          footer={
            <>
              <button
                type="button"
                className={cancelClass}
                onClick={() => setDeleting(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || confirmName.trim() !== client.name}
                className="h-11 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete client"}
              </button>
            </>
          }
        >
          <label className="block">
            <span className={modalLabelClass}>
              Type <span className="font-semibold text-ink">{client.name}</span> to confirm
            </span>
            <input
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              placeholder={client.name}
              className={modalInputClass}
            />
          </label>
        </ModalShell>
      </form>
    </div>
  );
}

function MenuRow({
  Icon,
  label,
  onClick,
  tone,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium transition-colors ${
        tone === "danger" ? "text-red-600 hover:bg-red-50" : "text-ink hover:bg-slate-50"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
