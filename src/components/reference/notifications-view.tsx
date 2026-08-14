import { AtSign, Bell, CheckCircle2, MessageCircle, UserRound } from "lucide-react";
import Link from "next/link";

export interface NotificationItem {
  id: string;
  boardId: string;
  type: "comment" | "move" | "assign" | "priority" | "mention";
  message: string;
  context: string;
  timestamp: string;
}

const iconMap = {
  comment: MessageCircle,
  move: CheckCircle2,
  assign: UserRound,
  priority: Bell,
  mention: AtSign,
};

export function NotificationsView({ notifications }: { notifications: NotificationItem[] }) {
  const today = notifications.slice(0, 3);
  const earlier = notifications.slice(3);
  const Row = ({ item }: { item: NotificationItem }) => {
    const Icon = iconMap[item.type];
    return (
      <Link
        href="/clients"
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-line bg-[#fffaf0] px-4 py-4 text-left last:border-b-0 sm:px-5"
      >
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-accent-foreground">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        </div>
        <div>
          <div className="text-sm font-semibold text-ink">{item.message}</div>
          <div className="mt-1 text-sm text-muted">{item.context}</div>
        </div>
        <div className="text-xs text-muted">{item.timestamp}</div>
      </Link>
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_250px]">
      <section className="overflow-hidden rounded-[18px] border border-line bg-white shadow-soft">
        <div className="px-5 py-4 text-base font-semibold">Today</div>
        {today.length ? (
          today.map((item) => <Row key={item.id} item={item} />)
        ) : (
          <div className="px-5 pb-5 text-sm text-muted">No notifications here.</div>
        )}
        <div className="border-t border-line px-5 py-4 text-base font-semibold">Earlier</div>
        {earlier.length ? (
          earlier.map((item) => <Row key={item.id} item={item} />)
        ) : (
          <div className="px-5 pb-5 text-sm text-muted">No earlier notifications.</div>
        )}
      </section>
      <aside className="h-fit rounded-[18px] border border-line bg-white p-5 shadow-soft">
        <h2 className="text-base font-semibold">Quick summary</h2>
        <div className="mt-4 divide-y divide-line">
          {[
            [notifications.length, "Queued", Bell],
            [notifications.filter((item) => item.type === "mention").length, "Mentions", AtSign],
            [
              notifications.filter((item) => item.type === "comment").length,
              "Comments",
              MessageCircle,
            ],
          ].map(([count, label, Icon]) => {
            const SummaryIcon = Icon as typeof Bell;
            return (
              <div key={String(label)} className="flex items-center gap-3 py-4 first:pt-1">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#fff3cc] text-accent-foreground">
                  <SummaryIcon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <div className="text-xl font-semibold">{String(count)}</div>
                  <div className="text-sm text-muted">{String(label)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
