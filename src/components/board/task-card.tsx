"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageSquare, UserRoundX } from "lucide-react";
import { ContributorBadge } from "@/components/contributor-badge";
import { TagBadge } from "@/components/tag-badge";
import { cn } from "@/lib/utils";
import type { ContributorColor, TaskPriority } from "@/db/schema";
import { TASK_PRIORITY_META } from "@/lib/task-priority";
import { useBoardStore } from "@/stores/board-store";

interface TaskCardProps {
  id: string;
  boardId: string;
  title: string;
  priority: TaskPriority;
  assignees: Array<{
    id: string;
    name: string;
    color: ContributorColor;
  }>;
  tags?: Array<{
    id: string;
    name: string;
    color: ContributorColor;
  }>;
  commentCount: number;
  createdAt: Date | null;
}

function getTaskAgeStyles(daysSinceCreated: number): { color: string; weight: string } {
  // Smooth transition: green → yellow (0-10 days) → red (10-20 days)
  // Font weight increases gradually after 10 days

  if (daysSinceCreated <= 0) {
    return { color: "text-emerald-600", weight: "font-normal" };
  }
  if (daysSinceCreated <= 2) {
    return { color: "text-emerald-500", weight: "font-normal" };
  }
  if (daysSinceCreated <= 4) {
    return { color: "text-green-500", weight: "font-normal" };
  }
  if (daysSinceCreated <= 6) {
    return { color: "text-lime-500", weight: "font-normal" };
  }
  if (daysSinceCreated <= 8) {
    return { color: "text-yellow-500", weight: "font-normal" };
  }
  if (daysSinceCreated <= 10) {
    return { color: "text-yellow-600", weight: "font-normal" };
  }
  if (daysSinceCreated <= 12) {
    return { color: "text-amber-500", weight: "font-medium" };
  }
  if (daysSinceCreated <= 14) {
    return { color: "text-amber-600", weight: "font-medium" };
  }
  if (daysSinceCreated <= 16) {
    return { color: "text-orange-500", weight: "font-semibold" };
  }
  if (daysSinceCreated <= 18) {
    return { color: "text-orange-600", weight: "font-semibold" };
  }
  if (daysSinceCreated <= 20) {
    return { color: "text-red-500", weight: "font-bold" };
  }
  // >20 days: deep red + bold
  return { color: "text-red-600", weight: "font-bold" };
}

function getDaysSinceCreated(createdAt: Date | null): number | null {
  if (!createdAt) return null;

  const now = new Date();
  const createdDate = new Date(createdAt);
  const diffTime = now.getTime() - createdDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

export function TaskCard({
  id,
  boardId,
  title,
  priority,
  assignees,
  tags,
  commentCount,
  createdAt,
}: TaskCardProps) {
  const router = useRouter();
  const displayTags = tags ?? [];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type: "task" },
  });

  const openTask = () => {
    // Set pending open task for instant sidebar (bypasses router delay)
    useBoardStore.getState().setPendingOpenTask({ boardId, taskId: id });
    // Navigate to the task
    const newUrl = `/boards/${boardId}?task=${id}`;
    window.history.pushState(window.history.state, "", newUrl);
    router.push(newUrl, { scroll: false });
  };

  const handleClick = (e: React.MouseEvent) => {
    // Prevent click when dragging
    if (isDragging) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    openTask();
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const daysSinceCreated = getDaysSinceCreated(createdAt);
  const taskAgeStyles =
    daysSinceCreated !== null
      ? getTaskAgeStyles(daysSinceCreated)
      : { color: "text-muted-foreground", weight: "font-normal" };

  const taskAgeText =
    daysSinceCreated !== null
      ? daysSinceCreated === 0
        ? "today"
        : daysSinceCreated === 1
          ? "1 day ago"
          : `${daysSinceCreated} days ago`
      : null;

  const { cardClassName, Icon: PriorityIcon, iconClassName } = TASK_PRIORITY_META[priority];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative glass rounded-lg px-3 py-2 transition-all hover:shadow-lg hover:scale-[1.01]",
        isDragging && "opacity-50 shadow-xl scale-[1.03]",
        cardClassName,
      )}
      {...attributes}
      {...listeners}
    >
      <Link
        href={`/boards/${boardId}?task=${id}`}
        className="absolute inset-0 z-10"
        onClick={handleClick}
        aria-label={`Open task ${title}`}
      />
      <h4 className="text-heading-sm text-foreground leading-snug">{title}</h4>

      {/* Priority + comments + age meta row */}
      <div className="mt-1.5 flex items-center gap-2">
        <PriorityIcon className={cn("h-3 w-3 shrink-0", iconClassName)} />

        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="h-3 w-3 shrink-0" />
          <span className="shrink-0">{commentCount}</span>
        </div>

        {taskAgeText && (
          <span className={cn("truncate text-xs", taskAgeStyles.color, taskAgeStyles.weight)}>
            · {taskAgeText}
          </span>
        )}
      </div>

      {/* Assignees row */}
      <div className="mt-1.5 flex items-start justify-end">
        {assignees.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-1">
            {assignees.map((assignee) => (
              <ContributorBadge
                key={assignee.id}
                name={assignee.name}
                color={assignee.color}
                variant="compact"
              />
            ))}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-muted-foreground/40 px-2 py-0.5 text-xs text-muted-foreground">
            <UserRoundX className="h-3 w-3" />
          </span>
        )}
      </div>

      {/* Tags row */}
      {displayTags.length > 0 && (
        <div className="mt-1 flex items-start justify-end">
          <div className="flex flex-wrap justify-end gap-1">
            {displayTags.map((tag) => (
              <TagBadge key={tag.id} name={tag.name} color={tag.color} variant="compact" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
