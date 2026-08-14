"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  eachDayOfInterval,
  addMonths,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { setTaskDueDate } from "@/actions/agency";

export interface CalendarTask {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  clientColor: string;
  dueDate: string | null;
}

function CalendarDay({
  day,
  month,
  events,
}: {
  day: Date;
  month: Date;
  events: (CalendarTask & { dueDate: string })[];
}) {
  const iso = format(day, "yyyy-MM-dd");
  const { isOver, setNodeRef } = useDroppable({
    id: `calendar-day-${iso}`,
    data: { date: iso },
  });

  return (
    <div
      ref={setNodeRef}
      data-calendar-date={iso}
      role="group"
      aria-label={`${format(day, "MMMM d, yyyy")}${isOver ? ", release to schedule" : ""}`}
      className={`min-h-[118px] border-b border-r border-line p-2 text-left align-top transition-colors duration-150 ${
        isOver
          ? "bg-[#fff3cc] ring-2 ring-inset ring-primary/30"
          : !isSameMonth(day, month)
            ? "bg-slate-50/40"
            : "bg-white"
      }`}
    >
      <div className={`text-xs ${isSameMonth(day, month) ? "text-[#667085]" : "text-slate-500"}`}>
        {format(day, "d")}
      </div>
      <div className="mt-2 space-y-1.5">
        {events.slice(0, 2).map((event) => (
          <Link
            key={event.id}
            href={`/clients/${event.clientId}/tasks/${event.id}`}
            className="block rounded-lg px-2 py-1.5 text-[11px] leading-4 transition-transform hover:-translate-y-px"
            style={{
              backgroundColor: `${event.clientColor}14`,
              borderLeft: `3px solid ${event.clientColor}`,
              color: "#334155",
            }}
          >
            <div className="truncate font-semibold">{event.title}</div>
          </Link>
        ))}
        {events.length > 2 && (
          <div className="px-2 text-[10px] font-medium text-muted">+{events.length - 2} more</div>
        )}
      </div>
    </div>
  );
}

function UnscheduledTask({ task }: { task: CalendarTask }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useDraggable({ id: task.id, data: { task } });

  return (
    <div
      ref={setNodeRef}
      data-calendar-task-id={task.id}
      className={`group flex min-h-14 items-center gap-1 py-3 transition-opacity first:pt-1 ${
        isDragging ? "opacity-30" : "opacity-100"
      }`}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Drag ${task.title} onto a calendar date`}
        className="grid h-11 w-11 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <Link
        href={`/clients/${task.clientId}/tasks/${task.id}`}
        draggable={false}
        className="min-w-0 flex-1"
      >
        <div className="truncate text-sm font-semibold text-ink">{task.title}</div>
        <div className="mt-1 text-xs text-muted">{task.clientName}</div>
      </Link>
    </div>
  );
}

function TaskDragPreview({ task }: { task: CalendarTask }) {
  return (
    <div className="w-64 rotate-1 rounded-xl border border-[#cddbf7] bg-white px-4 py-3 shadow-modal">
      <div className="truncate text-sm font-semibold text-ink">{task.title}</div>
      <div className="mt-1 text-xs text-muted">{task.clientName}</div>
    </div>
  );
}

export function MonthCalendar({ tasks }: { tasks: CalendarTask[] }) {
  const router = useRouter();
  const [month, setMonth] = useState(() => new Date());
  const [calendarTasks, setCalendarTasks] = useState(tasks);
  const [clientFilter, setClientFilter] = useState("all");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  useEffect(() => setCalendarTasks(tasks), [tasks]);

  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const last = endOfWeek(new Date(month.getFullYear(), month.getMonth() + 1, 0), {
    weekStartsOn: 0,
  });
  const days = eachDayOfInterval({ start: first, end: last });
  const visible =
    days.length < 42
      ? [
          ...days,
          ...eachDayOfInterval({
            start: new Date(last.getTime() + 86_400_000),
            end: new Date(last.getTime() + (42 - days.length) * 86_400_000),
          }),
        ]
      : days;
  const filteredTasks =
    clientFilter === "all"
      ? calendarTasks
      : calendarTasks.filter((task) => task.clientId === clientFilter);
  const datedTasks = filteredTasks.filter((task): task is CalendarTask & { dueDate: string } =>
    Boolean(task.dueDate),
  );
  const unscheduled = filteredTasks.filter((task) => !task.dueDate);
  const monthTasks = datedTasks.filter((task) => {
    const due = parseISO(task.dueDate);
    return due.getMonth() === month.getMonth() && due.getFullYear() === month.getFullYear();
  });
  const upcoming = monthTasks.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const activeTask = calendarTasks.find((task) => task.id === activeTaskId) ?? null;
  const clientOptions = Array.from(
    new Map(calendarTasks.map((task) => [task.clientId, task.clientName])).entries(),
  ).sort(([, left], [, right]) => left.localeCompare(right));
  const currentYear = new Date().getFullYear();
  const taskYears = datedTasks.map((task) => parseISO(task.dueDate).getFullYear());
  const yearOptions = Array.from(
    new Set([
      ...Array.from({ length: 9 }, (_, index) => currentYear - 4 + index),
      ...taskYears,
      month.getFullYear(),
    ]),
  ).sort((left, right) => left - right);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTaskId(null);
    const date = over?.data.current?.date;
    if (typeof date !== "string") return;

    const taskId = String(active.id);
    const previousTasks = calendarTasks;
    setCalendarTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, dueDate: date } : task)),
    );

    startTransition(async () => {
      try {
        await setTaskDueDate(taskId, date);
        toast.success(`Due date set to ${format(parseISO(date), "MMM d")}`);
        router.refresh();
      } catch (error) {
        setCalendarTasks(previousTasks);
        toast.error(error instanceof Error ? error.message : "Could not schedule task");
      }
    });
  };

  return (
    <DndContext
      id="calendar-scheduling"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }: DragStartEvent) => setActiveTaskId(String(active.id))}
      onDragCancel={() => setActiveTaskId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-label="Previous month"
          className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white"
          onClick={() => setMonth(subMonths(month, 1))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <select
          aria-label="Calendar month"
          value={month.getMonth()}
          onChange={(event) =>
            setMonth(new Date(month.getFullYear(), Number(event.target.value), 1))
          }
          className="h-11 rounded-xl border border-line bg-white px-4 text-sm font-medium outline-none focus:border-[#ffd54a] focus:ring-2 focus:ring-[#fff3cc]"
        >
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index} value={index}>
              {format(new Date(2026, index, 1), "MMMM")}
            </option>
          ))}
        </select>
        <select
          aria-label="Calendar year"
          value={month.getFullYear()}
          onChange={(event) => setMonth(new Date(Number(event.target.value), month.getMonth(), 1))}
          className="h-11 rounded-xl border border-line bg-white px-4 text-sm font-medium outline-none focus:border-[#ffd54a] focus:ring-2 focus:ring-[#fff3cc]"
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter calendar tasks"
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
          className="h-11 min-w-32 rounded-xl border border-line bg-white px-4 text-sm font-medium outline-none focus:border-[#ffd54a] focus:ring-2 focus:ring-[#fff3cc]"
        >
          <option value="all">All tasks</option>
          {clientOptions.map(([clientId, clientName]) => (
            <option key={clientId} value={clientId}>
              {clientName}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Next month"
          className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white"
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className="ml-auto h-11 rounded-xl border border-line bg-white px-4 text-sm font-medium"
          onClick={() => setMonth(new Date())}
        >
          Today
        </button>
      </div>
      <div className="grid gap-6 2xl:grid-cols-[minmax(840px,1fr)_285px]">
        <div className="app-scrollbar overflow-x-auto rounded-[18px] border border-line bg-white shadow-soft">
          <div className="min-w-[840px]">
            <div className="grid grid-cols-7 border-b border-line">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="px-3 py-4 text-center text-xs font-medium text-muted">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {visible.slice(0, 42).map((day) => {
                const iso = format(day, "yyyy-MM-dd");
                const events = datedTasks.filter((task) => task.dueDate === iso);
                return <CalendarDay key={iso} day={day} month={month} events={events} />;
              })}
            </div>
          </div>
        </div>
        <aside className="h-fit rounded-[18px] border border-line bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          <div className="app-scrollbar mt-4 max-h-[300px] divide-y divide-line overflow-y-auto">
            {upcoming.length ? (
              upcoming.map((task) => (
                <Link
                  key={task.id}
                  href={`/clients/${task.clientId}/tasks/${task.id}`}
                  className="block w-full py-4 text-left first:pt-1"
                >
                  <div className="text-xs text-muted">
                    {format(parseISO(task.dueDate), "EEE, MMM d")}
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-ink">{task.title}</div>
                  <div className="mt-1 text-sm text-muted">{task.clientName}</div>
                </Link>
              ))
            ) : (
              <p className="py-4 text-sm text-muted">No due tasks this month.</p>
            )}
          </div>
          <div className="mt-5 border-t border-line pt-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Unscheduled</h2>
              <span className="text-xs text-muted">{unscheduled.length}</span>
            </div>
            {unscheduled.length > 0 && (
              <p className="mt-1.5 text-xs leading-5 text-muted">
                Drag a task onto a calendar date to schedule it.
              </p>
            )}
            <div className="app-scrollbar mt-3 max-h-[300px] divide-y divide-line overflow-y-auto">
              {unscheduled.length ? (
                unscheduled.map((task) => <UnscheduledTask key={task.id} task={task} />)
              ) : (
                <p className="py-3 text-sm text-muted">Every board task has a due date.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
        {activeTask ? <TaskDragPreview task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
