import { format } from "date-fns";
import { MonthCalendar, type CalendarTask } from "@/components/reference/month-calendar";
import { PageHeader } from "@/components/reference/page-header";
import { CreateCalendarTaskAction } from "@/components/reference/page-create-actions";
import { listCalendarClientOptions, listCalendarTasks } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [rows, clients] = await Promise.all([listCalendarTasks(), listCalendarClientOptions()]);
  const tasks: CalendarTask[] = rows.map(({ task, client }) => ({
    id: task.id,
    title: task.title,
    clientId: client.id,
    clientName: client.name,
    clientColor: client.color,
    dueDate: task.dueAt ? format(task.dueAt, "yyyy-MM-dd") : null,
  }));

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title="Calendar" description="All tasks across clients, in one place.">
        <CreateCalendarTaskAction clients={clients} />
      </PageHeader>
      <MonthCalendar tasks={tasks} />
    </div>
  );
}
