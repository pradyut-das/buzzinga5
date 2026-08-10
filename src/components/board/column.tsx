"use client";

import { useState } from "react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { ChevronsLeftRight, ChevronsRightLeft, GripVertical, Plus, Trash2 } from "lucide-react";
import { EditableText } from "@/components/editable-text";
import { TaskCard } from "./task-card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateColumnName, useToggleColumnCollapsed, useDeleteColumn } from "@/hooks/use-board";
import { getRandomEmoji } from "@/lib/emojis";
import { boardKeys, type BoardData, type BoardTask } from "@/hooks/use-board";
import { useBoardStore } from "@/stores/board-store";
import { flushBoardOutbox } from "@/lib/outbox/flush";

import type { ContributorColor, TaskPriority } from "@/db/schema";

interface ColumnProps {
  id: string;
  boardId: string;
  name: string;
  isCollapsed: boolean;
  tasks: Array<{
    id: string;
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
  }>;
}

export function Column({ id, boardId, name, isCollapsed, tasks }: ColumnProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const collapsed = isCollapsed;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Mutations
  const updateColumnNameMutation = useUpdateColumnName(boardId);
  const toggleCollapsedMutation = useToggleColumnCollapsed(boardId);
  const deleteColumnMutation = useDeleteColumn(boardId);

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: "column" } });

  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `column-${id}`,
    data: { type: "column-drop", columnId: id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleNameSave = async (newName: string) => {
    updateColumnNameMutation.mutate({ columnId: id, name: newName });
  };

  const handleToggleCollapse = () => {
    toggleCollapsedMutation.mutate(id);
  };

  const handleDelete = async () => {
    deleteColumnMutation.mutate(id, {
      onSuccess: (result) => {
        if (result?.error) {
          toast.error(result.error);
        } else {
          toast.success("Column deleted");
          setIsDeleteDialogOpen(false);
        }
      },
      onError: () => {
        toast.error("Failed to delete column");
      },
    });
  };

  const handleAddTask = async () => {
    const emoji = getRandomEmoji();
    const title = `${emoji} New task`;
    const taskId = crypto.randomUUID();
    const createdAt = new Date();

    try {
      // 1) Local-first: update in-memory store immediately
      useBoardStore.getState().createTaskLocal({
        boardId,
        taskId,
        columnId: id,
        title,
        createdAt,
      });

      // 2) Keep current board UI stable (still TanStack-driven for now)
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;

        const newTask: BoardTask = {
          id: taskId,
          boardId,
          columnId: id,
          title,
          priority: "none",
          position: 0,
          createdAt,
          assignees: [],
          comments: [],
        };

        return {
          ...old,
          columns: old.columns.map((col) => {
            if (col.id !== id) return col;
            const maxPosition =
              col.tasks.length > 0 ? Math.max(...col.tasks.map((t) => t.position)) : -1;
            return { ...col, tasks: [...col.tasks, { ...newTask, position: maxPosition + 1 }] };
          }),
        };
      });

      // 3) Set pending open task in zustand for instant sidebar (bypasses router.push delay)
      useBoardStore.getState().setPendingOpenTask({ boardId, taskId });

      // 4) Update URL - pushState for browser, router.push for Next.js state
      const newUrl = `/boards/${boardId}?task=${taskId}`;
      window.history.pushState(window.history.state, "", newUrl);
      router.push(newUrl, { scroll: false });

      // 5) Background sync (outbox)
      useBoardStore.getState().enqueue({
        type: "createTask",
        boardId,
        payload: { taskId, columnId: id, title, createdAt },
      });
      void flushBoardOutbox(boardId);

      toast.success("Task created");
    } catch {
      toast.error("Failed to create task");
    }
  };

  const taskIds = tasks.map((t) => t.id);

  return (
    <div
      ref={setSortableRef}
      style={style}
      className={cn(
        "board-column relative flex h-full shrink-0 flex-col glass glass-strong transition-[width] duration-200 ease-in-out",
        collapsed ? "w-10" : "w-72",
        isDragging && "opacity-50",
      )}
    >
      {/* Collapsed View */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col items-end py-3 transition-opacity duration-200",
          collapsed ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleCollapse}
          className="h-6 w-6 shrink-0 self-center"
          title="Expand column"
        >
          <ChevronsLeftRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="mt-2 h-6 w-6 shrink-0 self-center text-muted-foreground"
          title="Drag column"
          aria-label="Drag column"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </Button>
        <div
          className="mt-2 flex items-center gap-3 whitespace-nowrap text-sm"
          style={{
            transform: "rotate(-90deg) translateX(0) translateY(-1.2rem)",
            transformOrigin: "right center",
          }}
        >
          <span className="text-xs text-muted-foreground">{tasks.length}</span>
          <span className="font-medium text-muted-foreground">{name}</span>
        </div>
      </div>

      {/* Expanded View */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col transition-opacity duration-200",
          collapsed ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        {/* Column Header */}
        <div className="board-column-header flex items-center gap-2 border-b border-border px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground"
            title="Drag column"
            aria-label="Drag column"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </Button>
          <EditableText
            value={name}
            onSave={handleNameSave}
            className="flex-1 text-heading-sm"
            inputClassName="text-heading-sm"
          />
          {tasks.length === 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
              title="Delete column"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{tasks.length}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleCollapse}
            className="h-6 w-6 shrink-0 text-muted-foreground"
            title="Collapse column"
          >
            <ChevronsRightLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Add Task Button */}
        <div className="border-b border-border px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddTask}
            className="h-7 w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add task
          </Button>
        </div>

        {/* Tasks */}
        <ScrollArea className="min-h-0 flex-1">
          <div ref={setDroppableRef} className="flex min-h-[100px] flex-col gap-2 p-3">
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  id={task.id}
                  boardId={boardId}
                  title={task.title}
                  priority={task.priority}
                  assignees={task.assignees}
                  tags={task.tags}
                  commentCount={task.commentCount}
                  createdAt={task.createdAt}
                />
              ))}
            </SortableContext>
          </div>
        </ScrollArea>
      </div>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Column</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this column? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={deleteColumnMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteColumnMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
