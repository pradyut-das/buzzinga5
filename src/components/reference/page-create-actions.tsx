"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTask } from "@/actions/agency";
import { createDocument } from "@/actions/docs";
import { adminCreateClient } from "@/actions/admin";
import { ModalShell, modalInputClass, modalLabelClass } from "@/components/reference/modal-shell";
import type { CalendarClientOption } from "@/lib/agency/queries";

const cancelClass =
  "h-11 rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink transition hover:bg-slate-50";
const submitClass =
  "h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[#e6a200] disabled:cursor-not-allowed disabled:opacity-50";

export function PageCreateButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[#e6a200]"
    >
      <Plus className="h-4 w-4" aria-hidden />
      Create
    </button>
  );
}

function ModalActions({
  pending,
  onCancel,
  submitLabel,
  canSubmit = true,
}: {
  pending: boolean;
  onCancel: () => void;
  submitLabel: string;
  canSubmit?: boolean;
}) {
  return (
    <>
      <button type="button" className={cancelClass} onClick={onCancel} disabled={pending}>
        Cancel
      </button>
      <button type="submit" className={submitClass} disabled={pending || !canSubmit}>
        {pending ? "Creating…" : submitLabel}
      </button>
    </>
  );
}

export function CreateClientAction() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [initials, setInitials] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [contact, setContact] = useState("");

  const close = () => {
    if (!pending) setOpen(false);
  };

  return (
    <div className="shrink-0">
      <PageCreateButton onClick={() => setOpen(true)} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await adminCreateClient({
              name,
              initials,
              color,
              contact,
            });
            if (!result.success) {
              toast.error(result.error ?? "Could not create client");
              return;
            }
            setOpen(false);
            setName("");
            setInitials("");
            setContact("");
            toast.success("Client created");
            router.refresh();
          });
        }}
      >
        <ModalShell
          open={open}
          onClose={close}
          title="Create client"
          description="Add an account to your active client workspace."
          footer={<ModalActions pending={pending} onCancel={close} submitLabel="Create client" />}
        >
          <div className="grid gap-5 sm:grid-cols-[1fr_120px]">
            <label>
              <span className={modalLabelClass}>Client name</span>
              <input
                autoFocus
                required
                maxLength={120}
                value={name}
                onChange={(event) => {
                  const value = event.target.value;
                  setName(value);
                  if (initials.length < 2) {
                    setInitials(
                      value
                        .trim()
                        .split(/\s+/)
                        .map((part) => part[0] ?? "")
                        .join("")
                        .slice(0, 2)
                        .toUpperCase(),
                    );
                  }
                }}
                placeholder="Acme"
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
                placeholder="AC"
                className={modalInputClass}
              />
            </label>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_120px]">
            <label>
              <span className={modalLabelClass}>Contact</span>
              <input
                maxLength={160}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder="Name or email (optional)"
                className={modalInputClass}
              />
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
        </ModalShell>
      </form>
    </div>
  );
}

export function CreateCalendarTaskAction({ clients }: { clients: CalendarClientOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const availableClients = clients;
  const [clientId, setClientId] = useState(availableClients[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const selectedClient = availableClients.find((client) => client.id === clientId);
  const close = () => {
    if (!pending) setOpen(false);
  };

  return (
    <div className="shrink-0">
      <PageCreateButton onClick={() => setOpen(true)} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            try {
              await createTask(clientId, title, 0, categoryId || null, dueDate);
              setOpen(false);
              setTitle("");
              setDueDate("");
              setCategoryId("");
              toast.success("Task created");
              router.refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not create task");
            }
          });
        }}
      >
        <ModalShell
          open={open}
          onClose={close}
          title="Create task"
          description="Add a task and place its deadline on the calendar."
          footer={
            <ModalActions
              pending={pending}
              onCancel={close}
              submitLabel="Create task"
              canSubmit={availableClients.length > 0}
            />
          }
        >
          {availableClients.length ? (
            <div className="space-y-5">
              <label className="block">
                <span className={modalLabelClass}>Task title</span>
                <input
                  autoFocus
                  required
                  maxLength={180}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What needs to be done?"
                  className={modalInputClass}
                />
              </label>
              <div className="grid gap-5 sm:grid-cols-2">
                <label>
                  <span className={modalLabelClass}>Client</span>
                  <select
                    required
                    value={clientId}
                    onChange={(event) => {
                      setClientId(event.target.value);
                      setCategoryId("");
                    }}
                    className={modalInputClass}
                  >
                    {availableClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={modalLabelClass}>Due date</span>
                  <input
                    required
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className={modalInputClass}
                  />
                </label>
              </div>
              <label className="block">
                <span className={modalLabelClass}>Category</span>
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className={modalInputClass}
                >
                  <option value="">No category</option>
                  {selectedClient?.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-muted">
              Create a board for a client before adding calendar tasks.
            </p>
          )}
        </ModalShell>
      </form>
    </div>
  );
}

/**
 * Creates a doc, which means creating the task it is the brief for. When
 * `clientId` is fixed the picker disappears — on a client's own Docs tab there
 * is nothing to choose.
 */
export function CreateDocAction({
  clientId,
  clients = [],
}: {
  clientId?: string;
  clients?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [pickedClient, setPickedClient] = useState(clientId ?? clients[0]?.id ?? "");
  const target = clientId ?? pickedClient;
  const close = () => {
    if (!pending) setOpen(false);
  };

  return (
    <div className="shrink-0">
      <PageCreateButton onClick={() => setOpen(true)} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!target) return;
          startTransition(async () => {
            try {
              const docId = await createDocument({ clientId: target, title });
              setOpen(false);
              setTitle("");
              toast.success("Doc created");
              router.push(`/clients/${target}/docs/${docId}`);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not create doc");
            }
          });
        }}
      >
        <ModalShell
          open={open}
          onClose={close}
          title="Create doc"
          description="Start a brief. It opens straight into the editor."
          footer={
            <ModalActions
              pending={pending}
              onCancel={close}
              submitLabel="Create doc"
              canSubmit={Boolean(target)}
            />
          }
        >
          {clientId || clients.length ? (
            <div className="space-y-5">
              <label className="block">
                <span className={modalLabelClass}>Doc title</span>
                <input
                  autoFocus
                  required
                  maxLength={180}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What is this brief about?"
                  className={modalInputClass}
                />
              </label>
              {!clientId && (
                <label className="block">
                  <span className={modalLabelClass}>Client</span>
                  <select
                    required
                    value={pickedClient}
                    onChange={(event) => setPickedClient(event.target.value)}
                    className={modalInputClass}
                  >
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-muted">
              Create a client before writing docs.
            </p>
          )}
        </ModalShell>
      </form>
    </div>
  );
}
