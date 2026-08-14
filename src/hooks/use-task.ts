"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTask, deleteTask } from "@/actions/tasks";
import { boardKeys, type BoardData, type BoardTask } from "./use-board";
import type { ContributorColor, TaskPriority } from "@/db/schema";
import { getRandomContributorColor } from "@/lib/contributor-colors";
import { getRandomTagColor } from "@/lib/tag-colors";
import { ensureTagHasHash } from "@/lib/tag-utils";
import { useBoardStore } from "@/stores/board-store";
import { flushBoardOutbox } from "@/lib/outbox/flush";

// Types for full task with comments
export interface TaskComment {
  id: string;
  content: string;
  createdAt: Date | null;
  author: {
    id: string;
    name: string;
    color: ContributorColor;
  };
  stakeholder?: {
    id: string;
    name: string;
    color: ContributorColor;
  } | null;
}

export interface TaskWithComments {
  id: string;
  title: string;
  priority: TaskPriority;
  columnId: string;
  boardId: string;
  createdAt: Date | null;
  doc?: string | null;
  column: {
    id: string;
    name: string;
  };
  assignees: Array<{
    contributor: {
      id: string;
      name: string;
      color: ContributorColor;
    };
  }>;
  stakeholders?: Array<{
    contributor: {
      id: string;
      name: string;
      color: ContributorColor;
    };
  }>;
  tags?: Array<{
    tag: {
      id: string;
      name: string;
      color: ContributorColor;
    };
  }>;
  comments: TaskComment[];
}

// Query keys
export const taskKeys = {
  all: ["tasks"] as const,
  detail: (id: string) => ["tasks", id] as const,
};

// Keep sidebar responsive; retries will handle transient failures.
const TASK_DETAIL_QUERY_TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Task detail fetch timed out after ${ms}ms`)),
      ms,
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

// Hook to get full task details (for sidebar)
export function useTaskQuery(
  taskId: string | null,
  options?: {
    /**
     * Sidebar needs to revalidate even when the cached task detail query is still "fresh"
     * (default staleTime is 30s). Use "always" for open-on-demand details.
     */
    refetchOnMount?: boolean | "always";
  },
) {
  return useQuery({
    queryKey: taskKeys.detail(taskId ?? ""),
    queryFn: () =>
      taskId
        ? withTimeout(
            getTask(taskId) as Promise<TaskWithComments | undefined>,
            TASK_DETAIL_QUERY_TIMEOUT_MS,
          )
        : undefined,
    enabled: !!taskId,
    // We manage retries explicitly in the sidebar to avoid long/spinning states.
    retry: 0,
    refetchOnMount: options?.refetchOnMount,
    refetchOnWindowFocus: false,
  });
}

// Hook to create a task with optimistic update
export function useCreateTask(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ columnId, title }: { columnId: string; title: string }) => {
      // Generate stable ID on client for local-first consistency
      const taskId = crypto.randomUUID();
      const createdAt = new Date();

      const newTask: BoardTask = {
        id: taskId,
        boardId,
        columnId,
        title,
        priority: "none",
        position: 0,
        createdAt,
        assignees: [],
        stakeholders: [],
        comments: [],
      };

      // Update local store
      useBoardStore.getState().createTaskLocal({
        boardId,
        taskId,
        columnId,
        title,
        createdAt,
      });

      // Update TanStack cache
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;

        return {
          ...old,
          columns: old.columns.map((col) => {
            if (col.id !== columnId) return col;

            // Get the max position + 1
            const maxPosition =
              col.tasks.length > 0 ? Math.max(...col.tasks.map((t) => t.position)) : -1;

            return {
              ...col,
              tasks: [...col.tasks, { ...newTask, position: maxPosition + 1 }],
            };
          }),
        };
      });

      // Enqueue for background sync
      useBoardStore.getState().enqueue({
        type: "createTask",
        boardId,
        payload: { taskId, columnId, title, createdAt },
      });
      // Don't auto-flush here: follow-up mutations (assignees, moves, etc.) often need to
      // flush multiple dependent operations in-order (create task -> assign -> move) and will
      // explicitly flush. This avoids overlapping flushes and race conditions in tests.

      return taskId;
    },
  });
}

// Hook to update task title (local-first + outbox)
export function useUpdateTaskTitle(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, title }: { taskId: string; title: string }) => {
      // 1) Update local store
      useBoardStore.getState().updateTaskTitleLocal({ boardId, taskId, title });

      // 2) Update TanStack caches
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((task) => (task.id === taskId ? { ...task, title } : task)),
          })),
        };
      });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return { ...old, title };
      });

      // 3) Enqueue for background sync
      useBoardStore.getState().enqueue({
        type: "updateTaskTitle",
        boardId,
        payload: { taskId, title },
      });
      void flushBoardOutbox(boardId);
    },
  });
}

// Hook to update task priority (local-first + outbox)
export function useUpdateTaskPriority(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, priority }: { taskId: string; priority: TaskPriority }) => {
      // 1) Update local store
      useBoardStore.getState().updateTaskPriorityLocal({ boardId, taskId, priority });

      // 2) Update TanStack caches
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((task) => (task.id === taskId ? { ...task, priority } : task)),
          })),
        };
      });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return { ...old, priority };
      });

      // 3) Enqueue for background sync
      useBoardStore.getState().enqueue({
        type: "updateTaskPriority",
        boardId,
        payload: { taskId, priority },
      });
      // Await flush to ensure server action is called and notifications are queued
      await flushBoardOutbox(boardId);
    },
  });
}

// Hook to update task created at (local-first + outbox)
export function useUpdateTaskCreatedAt(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, createdAt }: { taskId: string; createdAt: Date }) => {
      // 1) Update local store
      useBoardStore.getState().updateTaskCreatedAtLocal({ boardId, taskId, createdAt });

      // 2) Update TanStack cache
      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return { ...old, createdAt };
      });

      // 3) Enqueue for background sync
      useBoardStore.getState().enqueue({
        type: "updateTaskCreatedAt",
        boardId,
        payload: { taskId, createdAt },
      });
      void flushBoardOutbox(boardId);
    },
  });
}

// Hook to move task to another column (local-first + outbox)
// Note: Local store update (moveTaskLocal) is already done in board-client.tsx handleDragOver
export function useUpdateTaskColumn(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: async ({
      taskId,
      newColumnId,
      newPosition,
    }: {
      taskId: string;
      newColumnId: string;
      newPosition?: number;
    }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: boardKeys.detail(boardId) });

      // Snapshot the previous value
      const previousBoard = queryClient.getQueryData<BoardData>(boardKeys.detail(boardId));

      // Update local store first (UI reads from this)
      const board = useBoardStore.getState().boardsById[boardId];
      if (board) {
        const task = board.tasksById[taskId];
        if (task) {
          // Calculate target index in new column
          const targetColumnTaskIds = board.tasksByColumnId[newColumnId] ?? [];
          const targetIndex = newPosition ?? targetColumnTaskIds.length;

          // Update local store using moveTaskLocal
          useBoardStore.getState().moveTaskLocal({
            boardId,
            taskId,
            toColumnId: newColumnId,
            toIndex: targetIndex,
          });
        }
      }

      // Also update React Query cache for consistency
      if (previousBoard) {
        // Find the task
        let task: BoardTask | undefined;
        let oldColumnId: string | undefined;

        for (const col of previousBoard.columns) {
          const found = col.tasks.find((t) => t.id === taskId);
          if (found) {
            task = found;
            oldColumnId = col.id;
            break;
          }
        }

        if (task && oldColumnId) {
          // Skip if task is already in the correct position
          if (oldColumnId !== newColumnId || task.position !== newPosition) {
            // Calculate new position if not provided
            const targetColumn = previousBoard.columns.find((c) => c.id === newColumnId);
            const finalPosition =
              newPosition ??
              (targetColumn ? Math.max(...targetColumn.tasks.map((t) => t.position), -1) + 1 : 0);

            const updatedBoard: BoardData = {
              ...previousBoard,
              columns: previousBoard.columns.map((col) => {
                // Handle old column (remove task)
                if (col.id === oldColumnId && oldColumnId !== newColumnId) {
                  // Remove from old column and update positions
                  const filtered = col.tasks.filter((t) => t.id !== taskId);
                  return {
                    ...col,
                    tasks: filtered.map((t, i) => ({ ...t, position: i })),
                  };
                }
                // Handle new column (add task)
                if (col.id === newColumnId) {
                  // Add to new column
                  const movedTask = { ...task!, columnId: newColumnId, position: finalPosition };
                  // If moving within same column, filter out the task first
                  const existingTasks =
                    oldColumnId === newColumnId
                      ? col.tasks.filter((t) => t.id !== taskId)
                      : col.tasks;

                  const newTasks = [
                    ...existingTasks.map((t) =>
                      t.position >= finalPosition ? { ...t, position: t.position + 1 } : t,
                    ),
                    movedTask,
                  ].sort((a, b) => a.position - b.position);

                  // Normalize positions to be sequential (0, 1, 2, ...)
                  return {
                    ...col,
                    tasks: newTasks.map((t, i) => ({ ...t, position: i })),
                  };
                }
                return col;
              }),
            };

            queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), updatedBoard);

            // Update task cache with new column
            queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
              if (!old) return old;
              const newColumn = updatedBoard.columns.find((c) => c.id === newColumnId);
              return {
                ...old,
                columnId: newColumnId,
                column: newColumn ? { id: newColumn.id, name: newColumn.name } : old.column,
              };
            });
          }
        }
      }

      return { previousBoard };
    },
    mutationFn: async ({
      taskId,
      newColumnId,
      newPosition,
    }: {
      taskId: string;
      newColumnId: string;
      newPosition?: number;
    }) => {
      // Enqueue for background sync
      useBoardStore.getState().enqueue({
        type: "updateTaskColumn",
        boardId,
        payload: { taskId, columnId: newColumnId, position: newPosition },
      });
      // Await flush to ensure server action is called and notifications are queued
      await flushBoardOutbox(boardId);
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousBoard) {
        queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), context.previousBoard);
      }
    },
  });
}

// Hook to delete a task
// Note: Delete uses server action directly because it needs to delete comments first.
// We can't use pure local-first for delete since it has server-side cascade logic.
export function useDeleteTask(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId, boardId),
    onSuccess: (_result, taskId) => {
      // Update local store
      useBoardStore.getState().deleteTaskLocal({ boardId, taskId });

      // Update TanStack cache
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;

        let deletedTask: BoardTask | undefined;
        let columnId: string | undefined;

        for (const col of old.columns) {
          const found = col.tasks.find((t) => t.id === taskId);
          if (found) {
            deletedTask = found;
            columnId = col.id;
            break;
          }
        }

        if (!deletedTask || !columnId) return old;

        return {
          ...old,
          columns: old.columns.map((col) => {
            if (col.id !== columnId) return col;
            return {
              ...col,
              tasks: col.tasks
                .filter((t) => t.id !== taskId)
                .map((t) =>
                  t.position > deletedTask!.position ? { ...t, position: t.position - 1 } : t,
                ),
            };
          }),
        };
      });

      // Remove task from TanStack cache
      queryClient.removeQueries({ queryKey: taskKeys.detail(taskId) });
    },
  });
}

// Hook to add assignee to task (local-first + outbox)
export function useAddAssignee(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, contributorId }: { taskId: string; contributorId: string }) => {
      // Find contributor info
      const board = useBoardStore.getState().boardsById[boardId];
      const contributorFromStore = board?.contributorsById[contributorId];
      const contributorFromCache = queryClient
        .getQueryData<BoardData>(boardKeys.detail(boardId))
        ?.contributors.find((c) => c.id === contributorId);
      const contributor = contributorFromStore ?? contributorFromCache;
      if (!contributor) return;

      const newAssignee = {
        contributor: {
          id: contributor.id,
          name: contributor.name,
          color: contributor.color,
        },
      };

      // 1) Update local store
      useBoardStore.getState().addAssigneeLocal({ boardId, taskId, contributorId });

      // 2) Update TanStack caches
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((task) =>
              task.id === taskId ? { ...task, assignees: [...task.assignees, newAssignee] } : task,
            ),
          })),
        };
      });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return { ...old, assignees: [...old.assignees, newAssignee] };
      });

      // 3) Enqueue for background sync
      useBoardStore.getState().enqueue({
        type: "addAssignee",
        boardId,
        payload: { taskId, contributorId },
      });
      // Await flush to ensure server action is called and notifications are queued
      await flushBoardOutbox(boardId);
    },
  });
}

// Hook to remove assignee from task (local-first + outbox)
export function useRemoveAssignee(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, contributorId }: { taskId: string; contributorId: string }) => {
      // 1) Update local store
      useBoardStore.getState().removeAssigneeLocal({ boardId, taskId, contributorId });

      // 2) Update TanStack caches
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    assignees: task.assignees.filter((a) => a.contributor.id !== contributorId),
                  }
                : task,
            ),
          })),
        };
      });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return {
          ...old,
          assignees: old.assignees.filter((a) => a.contributor.id !== contributorId),
        };
      });

      // 3) Enqueue for background sync
      useBoardStore.getState().enqueue({
        type: "removeAssignee",
        boardId,
        payload: { taskId, contributorId },
      });
      void flushBoardOutbox(boardId);
    },
  });
}

// Hook to create and assign a new contributor
export function useCreateAndAssignContributor(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, name }: { taskId: string; name: string }) => {
      // Local-first: pick stable values on the client
      const contributorId = crypto.randomUUID();
      const color = getRandomContributorColor();

      // Update local store immediately (single source for contributor identity)
      useBoardStore.getState().createContributorLocal({
        boardId,
        contributorId,
        name,
        color,
      });
      useBoardStore.getState().addAssigneeLocal({ boardId, taskId, contributorId });

      // Update TanStack caches for current UI (board cards + sidebar task cache)
      await queryClient.cancelQueries({ queryKey: boardKeys.detail(boardId) });
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });

      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        const optimisticContributor = { id: contributorId, name, color, boardId };
        return {
          ...old,
          contributors: [...old.contributors, optimisticContributor],
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((t) => {
              if (t.id !== taskId) return t;
              return {
                ...t,
                assignees: [...t.assignees, { contributor: { id: contributorId, name, color } }],
              };
            }),
          })),
        };
      });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return {
          ...old,
          assignees: [...old.assignees, { contributor: { id: contributorId, name, color } }],
        };
      });

      // Background sync via outbox (no placeholder color, no flicker)
      useBoardStore.getState().enqueue({
        type: "createAndAssignContributor",
        boardId,
        payload: { taskId, contributorId, name, color },
      });
      // Await flush to ensure server action is called and notifications are queued
      await flushBoardOutbox(boardId);

      return contributorId;
    },
    onMutate: async () => {
      // mutationFn performs local-first work; keep onMutate as a no-op placeholder
      return {};
    },
    onSuccess: () => {
      // No invalidation needed; server stores client-chosen id/color.
    },
    onError: () => {
      // We optimize for good actors; errors are acceptable divergence.
    },
  });
}

// Hook to add stakeholder to task (local-first + outbox)
export function useAddStakeholder(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, contributorId }: { taskId: string; contributorId: string }) => {
      // Find contributor info
      const board = useBoardStore.getState().boardsById[boardId];
      const contributorFromStore = board?.contributorsById[contributorId];
      const contributorFromCache = queryClient
        .getQueryData<BoardData>(boardKeys.detail(boardId))
        ?.contributors.find((c) => c.id === contributorId);
      const contributor = contributorFromStore ?? contributorFromCache;
      if (!contributor) return;

      const newStakeholder = {
        contributor: {
          id: contributor.id,
          name: contributor.name,
          color: contributor.color,
        },
      };

      // 1) Update local store
      useBoardStore.getState().addStakeholderLocal({ boardId, taskId, contributorId });

      // 2) Update TanStack caches
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((task) =>
              task.id === taskId
                ? { ...task, stakeholders: [...(task.stakeholders ?? []), newStakeholder] }
                : task,
            ),
          })),
        };
      });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return { ...old, stakeholders: [...(old.stakeholders ?? []), newStakeholder] };
      });

      // 3) Enqueue for background sync
      useBoardStore.getState().enqueue({
        type: "addStakeholder",
        boardId,
        payload: { taskId, contributorId },
      });
      void flushBoardOutbox(boardId);
    },
  });
}

// Hook to remove stakeholder from task (local-first + outbox)
export function useRemoveStakeholder(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, contributorId }: { taskId: string; contributorId: string }) => {
      // 1) Update local store
      useBoardStore.getState().removeStakeholderLocal({ boardId, taskId, contributorId });

      // 2) Update TanStack caches
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    stakeholders: (task.stakeholders ?? []).filter(
                      (s) => s.contributor.id !== contributorId,
                    ),
                  }
                : task,
            ),
          })),
        };
      });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return {
          ...old,
          stakeholders: (old.stakeholders ?? []).filter((s) => s.contributor.id !== contributorId),
        };
      });

      // 3) Enqueue for background sync
      useBoardStore.getState().enqueue({
        type: "removeStakeholder",
        boardId,
        payload: { taskId, contributorId },
      });
      void flushBoardOutbox(boardId);
    },
  });
}

// Hook to create and add a new stakeholder
export function useCreateAndAddStakeholder(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, name }: { taskId: string; name: string }) => {
      // Local-first: pick stable values on the client
      const contributorId = crypto.randomUUID();
      const color = getRandomContributorColor();

      // Update local store immediately (single source for contributor identity)
      useBoardStore.getState().createContributorLocal({
        boardId,
        contributorId,
        name,
        color,
      });
      useBoardStore.getState().addStakeholderLocal({ boardId, taskId, contributorId });

      // Update TanStack caches for current UI (board cards + sidebar task cache)
      await queryClient.cancelQueries({ queryKey: boardKeys.detail(boardId) });
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });

      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        const optimisticContributor = { id: contributorId, name, color, boardId };
        return {
          ...old,
          contributors: [...old.contributors, optimisticContributor],
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((t) => {
              if (t.id !== taskId) return t;
              return {
                ...t,
                stakeholders: [
                  ...(t.stakeholders ?? []),
                  { contributor: { id: contributorId, name, color } },
                ],
              };
            }),
          })),
        };
      });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return {
          ...old,
          stakeholders: [
            ...(old.stakeholders ?? []),
            { contributor: { id: contributorId, name, color } },
          ],
        };
      });

      // Background sync via outbox (no placeholder color, no flicker)
      useBoardStore.getState().enqueue({
        type: "createAndAddStakeholder",
        boardId,
        payload: { taskId, contributorId, name, color },
      });
      void flushBoardOutbox(boardId);

      return contributorId;
    },
    onMutate: async () => {
      // mutationFn performs local-first work; keep onMutate as a no-op placeholder
      return {};
    },
    onSuccess: () => {
      // No invalidation needed; server stores client-chosen id/color.
    },
    onError: () => {
      // We optimize for good actors; errors are acceptable divergence.
    },
  });
}

// Hook to add tag to task (local-first + outbox)
export function useAddTag(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, tagId }: { taskId: string; tagId: string }) => {
      // Find tag info
      const board = useBoardStore.getState().boardsById[boardId];
      const tagFromStore = board?.tagsById[tagId];
      const tagFromCache = queryClient
        .getQueryData<BoardData>(boardKeys.detail(boardId))
        ?.tags.find((t) => t.id === tagId);
      const tag = tagFromStore ?? tagFromCache;
      if (!tag) return;

      const newTag = {
        tag: {
          id: tag.id,
          name: tag.name,
          color: tag.color,
        },
      };

      // 1) Update local store
      useBoardStore.getState().addTagLocal({ boardId, taskId, tagId });

      // 2) Update TanStack caches
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((task) =>
              task.id === taskId ? { ...task, tags: [...(task.tags ?? []), newTag] } : task,
            ),
          })),
        };
      });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return { ...old, tags: [...(old.tags ?? []), newTag] };
      });

      // 3) Enqueue for background sync
      useBoardStore.getState().enqueue({
        type: "addTag",
        boardId,
        payload: { taskId, tagId },
      });
      void flushBoardOutbox(boardId);
    },
  });
}

// Hook to remove tag from task (local-first + outbox)
export function useRemoveTag(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, tagId }: { taskId: string; tagId: string }) => {
      // 1) Update local store
      useBoardStore.getState().removeTagLocal({ boardId, taskId, tagId });

      // 2) Update TanStack caches
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    tags: (task.tags ?? []).filter((t) => t.tag.id !== tagId),
                  }
                : task,
            ),
          })),
        };
      });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return {
          ...old,
          tags: (old.tags ?? []).filter((t) => t.tag.id !== tagId),
        };
      });

      // 3) Enqueue for background sync
      useBoardStore.getState().enqueue({
        type: "removeTag",
        boardId,
        payload: { taskId, tagId },
      });
      void flushBoardOutbox(boardId);
    },
  });
}

// Hook to create and add a new tag
export function useCreateAndAddTag(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, name }: { taskId: string; name: string }) => {
      // Local-first: pick stable values on the client
      const tagId = crypto.randomUUID();
      const color = getRandomTagColor();

      // Ensure tag name starts with "#"
      const normalizedName = ensureTagHasHash(name);

      // Update local store immediately (single source for tag identity)
      useBoardStore.getState().createTagLocal({
        boardId,
        tagId,
        name: normalizedName,
        color,
      });
      useBoardStore.getState().addTagLocal({ boardId, taskId, tagId });

      // Update TanStack caches for current UI (board cards + sidebar task cache)
      await queryClient.cancelQueries({ queryKey: boardKeys.detail(boardId) });
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });

      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        const optimisticTag = { id: tagId, name: normalizedName, color, boardId };
        return {
          ...old,
          tags: [...old.tags, optimisticTag],
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((t) => {
              if (t.id !== taskId) return t;
              return {
                ...t,
                tags: [...(t.tags ?? []), { tag: { id: tagId, name: normalizedName, color } }],
              };
            }),
          })),
        };
      });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return {
          ...old,
          tags: [...(old.tags ?? []), { tag: { id: tagId, name: normalizedName, color } }],
        };
      });

      // Background sync via outbox (no placeholder color, no flicker)
      useBoardStore.getState().enqueue({
        type: "createAndAddTag",
        boardId,
        payload: { taskId, tagId, name: normalizedName, color },
      });
      void flushBoardOutbox(boardId);

      return tagId;
    },
    onMutate: async () => {
      // mutationFn performs local-first work; keep onMutate as a no-op placeholder
      return {};
    },
    onSuccess: () => {
      // No invalidation needed; server stores client-chosen id/color.
    },
    onError: () => {
      // We optimize for good actors; errors are acceptable divergence.
    },
  });
}

// Hook to add a comment
export function useCreateComment(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      authorId,
      content,
      stakeholderId,
      commentId: providedCommentId,
    }: {
      taskId: string;
      authorId: string;
      content: string;
      stakeholderId?: string | null;
      commentId?: string; // Optional: pass a pre-generated ID for file uploads
    }) => {
      const board = useBoardStore.getState().boardsById[boardId];
      const authorFromStore = board?.contributorsById[authorId];
      const authorFromCache = queryClient
        .getQueryData<BoardData>(boardKeys.detail(boardId))
        ?.contributors.find((c) => c.id === authorId);

      const author = authorFromStore ?? authorFromCache;
      if (!author) throw new Error("Author not found");

      const stakeholderFromStore = stakeholderId ? board?.contributorsById[stakeholderId] : null;
      const stakeholderFromCache = stakeholderId
        ? queryClient
            .getQueryData<BoardData>(boardKeys.detail(boardId))
            ?.contributors.find((c) => c.id === stakeholderId)
        : null;
      const stakeholder = stakeholderFromStore ?? stakeholderFromCache;

      // Use provided commentId if available (for file uploads), otherwise generate new one
      const commentId = providedCommentId ?? crypto.randomUUID();
      const createdAt = new Date();

      const newComment: TaskComment = {
        id: commentId,
        content,
        createdAt,
        author: { id: author.id, name: author.name, color: author.color },
        stakeholder: stakeholder
          ? { id: stakeholder.id, name: stakeholder.name, color: stakeholder.color }
          : null,
      };

      // Local-first store (drives sidebar UI)
      useBoardStore.getState().createCommentLocal({ boardId, taskId, comment: newComment });

      // TanStack caches (board card meta + task query if present)
      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return { ...old, comments: [...old.comments, newComment] };
      });

      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((task) => {
              if (task.id !== taskId) return task;
              const newCommentMeta = { id: commentId, createdAt };
              const comments = [newCommentMeta, ...task.comments].sort((a, b) => {
                if (!a.createdAt || !b.createdAt) return 0;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              });
              return { ...task, comments };
            }),
          })),
        };
      });

      // Outbox sync (ensures ordering behind task creation)
      useBoardStore.getState().enqueue({
        type: "createComment",
        boardId,
        payload: {
          taskId,
          commentId,
          authorId,
          content,
          createdAt,
          stakeholderId: stakeholderId ?? null,
        },
      });
      // Await flush to ensure server action is called and notifications are queued
      await flushBoardOutbox(boardId);

      return commentId;
    },
  });
}

// Hook to update a comment
export function useUpdateComment(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commentId,
      taskId,
      authorId,
      content,
      stakeholderId,
    }: {
      commentId: string;
      taskId: string;
      authorId: string;
      content: string;
      stakeholderId?: string | null;
    }) => {
      const board = useBoardStore.getState().boardsById[boardId];
      const authorFromStore = board?.contributorsById[authorId];
      const authorFromCache = queryClient
        .getQueryData<BoardData>(boardKeys.detail(boardId))
        ?.contributors.find((c) => c.id === authorId);
      const author = authorFromStore ?? authorFromCache;

      const stakeholderFromStore = stakeholderId ? board?.contributorsById[stakeholderId] : null;
      const stakeholderFromCache = stakeholderId
        ? queryClient
            .getQueryData<BoardData>(boardKeys.detail(boardId))
            ?.contributors.find((c) => c.id === stakeholderId)
        : null;
      const stakeholder = stakeholderFromStore ?? stakeholderFromCache;

      useBoardStore.getState().updateCommentLocal({
        boardId,
        taskId,
        commentId,
        author: author ? { id: author.id, name: author.name, color: author.color } : undefined,
        stakeholder: stakeholder
          ? { id: stakeholder.id, name: stakeholder.name, color: stakeholder.color }
          : null,
        content,
      });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return {
          ...old,
          comments: old.comments.map((c) =>
            c.id === commentId
              ? {
                  ...c,
                  content,
                  author: author
                    ? { id: author.id, name: author.name, color: author.color }
                    : c.author,
                  stakeholder: stakeholder
                    ? { id: stakeholder.id, name: stakeholder.name, color: stakeholder.color }
                    : null,
                }
              : c,
          ),
        };
      });

      useBoardStore.getState().enqueue({
        type: "updateComment",
        boardId,
        payload: { taskId, commentId, authorId, content, stakeholderId: stakeholderId ?? null },
      });
      void flushBoardOutbox(boardId);
    },
    onMutate: async ({ commentId, taskId, authorId, content }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });

      const previousTask = queryClient.getQueryData<TaskWithComments>(taskKeys.detail(taskId));
      const board = queryClient.getQueryData<BoardData>(boardKeys.detail(boardId));

      // Find author info
      const author = board?.contributors.find((c) => c.id === authorId);

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return {
          ...old,
          comments: old.comments.map((c) =>
            c.id === commentId
              ? {
                  ...c,
                  content,
                  author: author
                    ? { id: author.id, name: author.name, color: author.color }
                    : c.author,
                }
              : c,
          ),
        };
      });

      return { previousTask };
    },
    onError: (_err, { taskId }, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(taskKeys.detail(taskId), context.previousTask);
      }
    },
  });
}

// Hook to delete a comment
export function useDeleteComment(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId, taskId }: { commentId: string; taskId: string }) => {
      useBoardStore.getState().deleteCommentLocal({ boardId, taskId, commentId });

      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return { ...old, comments: old.comments.filter((c) => c.id !== commentId) };
      });

      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((task) =>
              task.id === taskId
                ? { ...task, comments: task.comments.filter((c) => c.id !== commentId) }
                : task,
            ),
          })),
        };
      });

      useBoardStore.getState().enqueue({
        type: "deleteComment",
        boardId,
        payload: { taskId, commentId },
      });
      void flushBoardOutbox(boardId);
    },
    onMutate: async ({ commentId, taskId }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      await queryClient.cancelQueries({ queryKey: boardKeys.detail(boardId) });

      const previousTask = queryClient.getQueryData<TaskWithComments>(taskKeys.detail(taskId));
      const previousBoard = queryClient.getQueryData<BoardData>(boardKeys.detail(boardId));

      // Update task cache
      queryClient.setQueryData<TaskWithComments>(taskKeys.detail(taskId), (old) => {
        if (!old) return old;
        return { ...old, comments: old.comments.filter((c) => c.id !== commentId) };
      });

      // Update board cache
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((task) =>
              task.id === taskId
                ? { ...task, comments: task.comments.filter((c) => c.id !== commentId) }
                : task,
            ),
          })),
        };
      });

      return { previousTask, previousBoard };
    },
    onError: (_err, { taskId }, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(taskKeys.detail(taskId), context.previousTask);
      }
      if (context?.previousBoard) {
        queryClient.setQueryData(boardKeys.detail(boardId), context.previousBoard);
      }
    },
  });
}

// Hook for optimistic task updates in board view (for drag and drop)
export function useOptimisticTasksUpdate(boardId: string) {
  const queryClient = useQueryClient();

  return {
    setTasks: (columnId: string, updater: (tasks: BoardTask[]) => BoardTask[]) => {
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) =>
            col.id === columnId ? { ...col, tasks: updater(col.tasks) } : col,
          ),
        };
      });
    },
    moveTask: (taskId: string, fromColumnId: string, toColumnId: string, toPosition: number) => {
      queryClient.setQueryData<BoardData>(boardKeys.detail(boardId), (old) => {
        if (!old) return old;

        let task: BoardTask | undefined;
        for (const col of old.columns) {
          const found = col.tasks.find((t) => t.id === taskId);
          if (found) {
            task = found;
            break;
          }
        }

        if (!task) return old;

        return {
          ...old,
          columns: old.columns.map((col) => {
            if (col.id === fromColumnId && col.id !== toColumnId) {
              return {
                ...col,
                tasks: col.tasks.filter((t) => t.id !== taskId),
              };
            }
            if (col.id === toColumnId) {
              const existingTasks =
                col.id === fromColumnId ? col.tasks.filter((t) => t.id !== taskId) : col.tasks;
              const movedTask = { ...task!, columnId: toColumnId, position: toPosition };
              return {
                ...col,
                tasks: [...existingTasks, movedTask].sort((a, b) => a.position - b.position),
              };
            }
            return col;
          }),
        };
      });
    },
  };
}
