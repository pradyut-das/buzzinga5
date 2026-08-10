"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CommentsSection } from "./comments-section";
import { TaskDetails } from "./task-details";
import { taskKeys, useTaskQuery } from "@/hooks/use-task";
import { SyncIndicator } from "@/components/sync-indicator";
import { Button } from "@/components/ui/button";
import type { ContributorColor } from "@/db/schema";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useBoardHost } from "@/components/board/board-host";
import { selectBoard, selectTaskDetails, useBoardStore } from "@/stores/board-store";
import { flushBoardOutbox } from "@/lib/outbox/flush";

interface TaskSidebarProps {
  taskId: string;
  boardId: string;
  columns: Array<{
    id: string;
    name: string;
  }>;
  contributors: Array<{
    id: string;
    name: string;
    color: ContributorColor;
    email?: string | null;
  }>;
  tags: Array<{
    id: string;
    name: string;
    color: ContributorColor;
  }>;
}

const MAX_COMMENT_REFETCH_ATTEMPTS = 3;

export function TaskSidebar({ taskId, boardId, columns, contributors, tags }: TaskSidebarProps) {
  const router = useRouter();
  const { embedded } = useBoardHost();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(true);
  const [commentRefetchAttempts, setCommentRefetchAttempts] = useState(0);
  const [hasCommentLoadStalled, setHasCommentLoadStalled] = useState(false);
  const pendingRefetchTimerRef = useRef<number | null>(null);
  const hasAutoRetriedRef = useRef(false);

  const board = useBoardStore(selectBoard(boardId));
  const localTaskEntity = board?.tasksById[taskId];
  const pendingCreate = (board?.outbox ?? []).some(
    (i) => i.type === "createTask" && i.payload.taskId === taskId,
  );

  // Task details from local store (includes comments if previously fetched/created)
  const hydratedTaskDetails = useBoardStore(selectTaskDetails(boardId, taskId));

  // Board polling keeps comment meta (count + latest timestamp) fresh, but does not refresh
  // taskDetailsById (sidebar details cache). This lets us detect when cached sidebar details are stale.
  const commentMeta = board?.commentMetaByTaskId[taskId];
  const isHydratedTaskDetailsStale = useMemo(() => {
    if (!hydratedTaskDetails || !commentMeta) return false;

    // Fast path: count mismatch
    if (commentMeta.count !== hydratedTaskDetails.comments.length) return true;

    // Timestamp check: if meta says there's a newer comment than what details have, details are stale.
    const metaLast = commentMeta.lastCreatedAt
      ? new Date(commentMeta.lastCreatedAt).getTime()
      : null;
    if (metaLast === null) return false;

    let detailsLast: number | null = null;
    for (const c of hydratedTaskDetails.comments) {
      if (!c.createdAt) continue;
      const t = new Date(c.createdAt).getTime();
      if (detailsLast === null || t > detailsLast) detailsLast = t;
    }

    // Meta has a timestamp but details have none => stale
    if (detailsLast === null) return true;

    return metaLast > detailsLast;
  }, [hydratedTaskDetails, commentMeta]);

  // Be liberal: always revalidate full task details on sidebar open (unless this is a local-first
  // task create that is not yet on the server).
  const shouldFetchTaskDetails = !pendingCreate;

  const {
    data: serverTask,
    isLoading: isServerLoading,
    isFetching: isServerFetching,
    refetch: refetchTask,
  } = useTaskQuery(shouldFetchTaskDetails ? taskId : null, { refetchOnMount: "always" });

  // Always invalidate+refetch on mount/open to avoid relying on staleness heuristics.
  useEffect(() => {
    if (!shouldFetchTaskDetails) return;
    setCommentRefetchAttempts(0);
    void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
    void queryClient.refetchQueries({ queryKey: taskKeys.detail(taskId) });
  }, [shouldFetchTaskDetails, queryClient, taskId]);

  const taskForUI = useMemo(() => {
    // Start with hydrated task details or server task as base
    const baseTask = hydratedTaskDetails ?? serverTask;

    // Merge comments safely for UI:
    // - Prefer local (store) versions when IDs collide (keeps optimistic/local edits)
    // - Include server comments even when store is dirty (hydrateTaskFromServer will refuse to overwrite)
    // - Keep sidebar order ASC (oldest -> newest)
    const mergedComments = (() => {
      const byId = new Map<string, NonNullable<typeof baseTask>["comments"][number]>();
      for (const c of serverTask?.comments ?? []) byId.set(c.id, c);
      for (const c of hydratedTaskDetails?.comments ?? []) byId.set(c.id, c);
      const list = Array.from(byId.values());
      list.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : null;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : null;
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return ta - tb;
      });
      return list;
    })();

    // If we have a local task entity and board, derive assignees and stakeholders from normalized store
    // This ensures contributor updates (name, color) are immediately reflected
    if (localTaskEntity && board) {
      const assigneeIds = board.assigneeIdsByTaskId[taskId] ?? [];
      const assignees = assigneeIds
        .map((cid) => board.contributorsById[cid])
        .filter(Boolean)
        .map((c) => ({ contributor: { id: c.id, name: c.name, color: c.color } }));

      const stakeholderIds = board.stakeholderIdsByTaskId[taskId] ?? [];
      const stakeholders = stakeholderIds
        .map((cid) => board.contributorsById[cid])
        .filter(Boolean)
        .map((c) => ({ contributor: { id: c.id, name: c.name, color: c.color } }));

      const tagIds = board.tagIdsByTaskId[taskId] ?? [];
      const tags = tagIds
        .map((tid) => board.tagsById[tid])
        .filter(Boolean)
        .map((t) => ({ tag: { id: t.id, name: t.name, color: t.color } }));

      return {
        id: localTaskEntity.id,
        title: localTaskEntity.title,
        priority: localTaskEntity.priority,
        columnId: localTaskEntity.columnId,
        boardId,
        createdAt: localTaskEntity.createdAt,
        column: {
          id: localTaskEntity.columnId,
          name: columns.find((c) => c.id === localTaskEntity.columnId)?.name ?? "",
        },
        assignees,
        stakeholders,
        tags,
        comments: mergedComments,
      };
    }

    // Fallback: if we have a base task but no local entity, still derive assignees and stakeholders from normalized store
    // when available to ensure contributor color updates are reflected
    if (baseTask && board) {
      const assigneeIds =
        board.assigneeIdsByTaskId[taskId] ?? baseTask.assignees.map((a) => a.contributor.id);
      const assignees = assigneeIds
        .map((cid) => board.contributorsById[cid])
        .filter(Boolean)
        .map((c) => ({ contributor: { id: c.id, name: c.name, color: c.color } }));

      const stakeholderIds =
        board.stakeholderIdsByTaskId[taskId] ??
        (baseTask.stakeholders ?? []).map((s) => s.contributor.id);
      const stakeholders = stakeholderIds
        .map((cid) => board.contributorsById[cid])
        .filter(Boolean)
        .map((c) => ({ contributor: { id: c.id, name: c.name, color: c.color } }));

      const tagIds = board.tagIdsByTaskId[taskId] ?? (baseTask.tags ?? []).map((t) => t.tag.id);
      const tags = tagIds
        .map((tid) => board.tagsById[tid])
        .filter(Boolean)
        .map((t) => ({ tag: { id: t.id, name: t.name, color: t.color } }));

      return {
        ...baseTask,
        assignees,
        stakeholders,
        tags,
        comments: mergedComments,
      };
    }

    return baseTask;
  }, [hydratedTaskDetails, localTaskEntity, board, taskId, boardId, columns, serverTask]);

  const expectedCommentCount = commentMeta?.count ?? 0;
  const shownCommentCount = taskForUI?.comments?.length ?? 0;
  const isWaitingForComments =
    expectedCommentCount > 0 && shownCommentCount === 0 && shouldFetchTaskDetails;
  const shouldShowCommentsLoading =
    isWaitingForComments &&
    (isServerLoading || isServerFetching || commentRefetchAttempts < MAX_COMMENT_REFETCH_ATTEMPTS);
  const shouldShowCommentsRetry =
    isWaitingForComments &&
    !isServerLoading &&
    !isServerFetching &&
    commentRefetchAttempts >= MAX_COMMENT_REFETCH_ATTEMPTS;

  const triggerCommentsRetry = useCallback(() => {
    setCommentRefetchAttempts(0);
    setHasCommentLoadStalled(false);

    if (pendingRefetchTimerRef.current) {
      window.clearTimeout(pendingRefetchTimerRef.current);
      pendingRefetchTimerRef.current = null;
    }

    void queryClient.invalidateQueries({
      queryKey: taskKeys.detail(taskId),
    });
    void refetchTask();
  }, [queryClient, refetchTask, taskId]);

  // If we appear to be "stuck fetching" for too long, stop showing an infinite spinner and surface Retry.
  useEffect(() => {
    if (!isWaitingForComments) {
      setHasCommentLoadStalled(false);
      hasAutoRetriedRef.current = false;
      return;
    }

    // Reset stall flag when a new wait cycle begins.
    setHasCommentLoadStalled(false);
    hasAutoRetriedRef.current = false;
    const t = window.setTimeout(() => setHasCommentLoadStalled(true), 5_000);
    return () => window.clearTimeout(t);
  }, [isWaitingForComments, taskId]);

  // Auto-retry once when we detect a stall, using the exact same logic as the Retry button.
  useEffect(() => {
    if (!hasCommentLoadStalled) return;
    if (!isWaitingForComments) return;
    if (hasAutoRetriedRef.current) return;
    hasAutoRetriedRef.current = true;
    triggerCommentsRetry();
  }, [hasCommentLoadStalled, isWaitingForComments, triggerCommentsRetry]);

  // Retry refetch a few times when meta says comments exist but details still show none.
  // This is intentionally conservative (bounded) and helps with rare inconsistencies
  // (e.g. replication lag / transient reads).
  useEffect(() => {
    if (!shouldFetchTaskDetails) return;
    if (expectedCommentCount <= 0) return;
    if (shownCommentCount >= expectedCommentCount) return;
    if (isServerFetching) return;

    if (commentRefetchAttempts >= MAX_COMMENT_REFETCH_ATTEMPTS) return;
    if (pendingRefetchTimerRef.current) return;

    const nextAttempt = commentRefetchAttempts + 1;
    // Keep retries snappy: 100ms, 200ms, 300ms
    const delayMs = 100 * nextAttempt;
    pendingRefetchTimerRef.current = window.setTimeout(() => {
      pendingRefetchTimerRef.current = null;
      setCommentRefetchAttempts(nextAttempt);
      void refetchTask();
    }, delayMs);

    return () => {
      if (pendingRefetchTimerRef.current) {
        window.clearTimeout(pendingRefetchTimerRef.current);
        pendingRefetchTimerRef.current = null;
      }
    };
  }, [
    shouldFetchTaskDetails,
    expectedCommentCount,
    shownCommentCount,
    isServerFetching,
    refetchTask,
    commentRefetchAttempts,
  ]);

  const currentContributors = useMemo(() => {
    if (board) {
      return board.contributorOrder
        .map((id) => board.contributorsById[id])
        .filter(Boolean)
        .map((c) => ({ id: c.id, name: c.name, color: c.color, email: c.email }));
    }
    return contributors;
  }, [board, contributors]);

  const currentTags = useMemo(() => {
    if (board) {
      return board.tagOrder
        .map((id) => board.tagsById[id])
        .filter(Boolean)
        .map((t) => ({ id: t.id, name: t.name, color: t.color }));
    }
    return tags;
  }, [board, tags]);

  const handleClose = useCallback(() => {
    // Kick off a flush on close, but don't block closing the sheet on slow networks.
    // (Tests already include waits; and other critical flows await flush explicitly.)
    void flushBoardOutbox(boardId);

    setIsOpen(false);
    // Clear pending task to ensure clean state for reopening
    useBoardStore.getState().setPendingOpenTask(null);
    // Embedded there is no task URL to undo — see BoardHostContext.
    if (!embedded) router.replace(`/boards/${boardId}`);
  }, [router, boardId, embedded]);

  // Hydrate server task into local store when it arrives
  useEffect(() => {
    if (serverTask && (!hydratedTaskDetails || isHydratedTaskDetailsStale)) {
      useBoardStore.getState().hydrateTaskFromServer(boardId, serverTask);
    }
  }, [serverTask, hydratedTaskDetails, isHydratedTaskDetailsStale, boardId]);

  useEffect(() => {
    // If the task is truly missing (deep-link to invalid id), close gracefully.
    // For local-first creates, we never close while the create is pending.
    if (!pendingCreate && !localTaskEntity && !isServerLoading && !taskForUI) {
      handleClose();
    }
  }, [pendingCreate, localTaskEntity, isServerLoading, taskForUI, handleClose]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 lg:max-w-[1040px]" hideCloseButton>
        <SheetHeader className="sr-only">
          <SheetTitle>Edit Task</SheetTitle>
        </SheetHeader>

        {!taskForUI || (isServerLoading && !localTaskEntity && !hydratedTaskDetails) ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          /* Mobile/Tablet: single scroll container | Desktop: each panel scrolls independently */
          <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
            {/* Task Details - First on mobile/tablet (stacked), right side on desktop */}
            <div className="relative order-1 lg:order-2 flex-none lg:flex-[3] min-h-0 lg:overflow-y-auto border-b lg:border-b-0 lg:border-l border-border">
              {/* Sticky header - transparent to inherit sidebar glass */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 border-b border-border/20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="h-8 gap-1 rounded-full px-3 text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="text-sm">Back</span>
                </Button>
                <SyncIndicator boardId={boardId} />
              </div>
              <TaskDetails
                task={{
                  id: taskForUI.id,
                  title: taskForUI.title,
                  priority: taskForUI.priority,
                  columnId: taskForUI.columnId,
                  boardId: boardId,
                  createdAt: taskForUI.createdAt,
                  assignees: taskForUI.assignees,
                  stakeholders: taskForUI.stakeholders,
                  tags: taskForUI.tags,
                  comments: taskForUI.comments,
                }}
                columns={columns}
                contributors={currentContributors}
                tags={currentTags}
                onClose={handleClose}
              />
            </div>

            {/* Comments - Second on mobile/tablet (stacked), left side on desktop */}
            <div className="order-2 lg:order-1 flex-1 lg:flex-[7] min-h-0 lg:overflow-y-auto">
              {shouldShowCommentsLoading && !hasCommentLoadStalled ? (
                <div className="flex h-full min-h-[240px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {(shouldShowCommentsRetry || hasCommentLoadStalled) && (
                    <div className="px-6 pt-6">
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">Comments didn’t load</div>
                          <div className="text-xs text-muted-foreground">
                            We expected {expectedCommentCount} comment
                            {expectedCommentCount === 1 ? "" : "s"}, but none loaded. Try again.
                          </div>
                        </div>
                        <Button size="sm" variant="secondary" onClick={triggerCommentsRetry}>
                          Retry
                        </Button>
                      </div>
                    </div>
                  )}
                  <CommentsSection
                    taskId={taskForUI.id}
                    boardId={boardId}
                    comments={taskForUI.comments}
                    contributors={currentContributors}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface TaskSidebarHostProps {
  boardId: string;
  columns: Array<{ id: string; name: string }>;
  contributors: Array<{ id: string; name: string; color: ContributorColor; email?: string | null }>;
  tags: Array<{ id: string; name: string; color: ContributorColor }>;
}

export function TaskSidebarHost({ boardId, columns, contributors, tags }: TaskSidebarHostProps) {
  const searchParams = useSearchParams();
  const urlTaskId = searchParams.get("task");
  const [openCount, setOpenCount] = useState(0);

  // Use pending task from zustand for instant sidebar (bypasses router.push delay)
  const pendingOpenTask = useBoardStore((s) => s.pendingOpenTask);
  const pendingTaskId = pendingOpenTask?.boardId === boardId ? pendingOpenTask.taskId : null;

  // Prefer pending task (local-first), fall back to URL (for direct links/refreshes)
  const taskId = pendingTaskId ?? urlTaskId;

  // Track when a new sidebar opens (increment counter for unique key)
  useEffect(() => {
    if (taskId) {
      setOpenCount((c) => c + 1);
    }
  }, [taskId]);

  // Clear pending task once URL catches up
  useEffect(() => {
    if (urlTaskId && pendingTaskId && urlTaskId === pendingTaskId) {
      useBoardStore.getState().setPendingOpenTask(null);
    }
  }, [urlTaskId, pendingTaskId]);

  if (!taskId) return null;

  return (
    <TaskSidebar
      key={`${taskId}-${openCount}`}
      taskId={taskId}
      boardId={boardId}
      columns={columns}
      contributors={contributors}
      tags={tags}
    />
  );
}
