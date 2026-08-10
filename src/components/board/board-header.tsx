"use client";

import { useState } from "react";
import {
  Users,
  Share2,
  Tag,
  Mail,
  Menu,
  Sun,
  Moon,
  Monitor,
  Check,
  ArrowUpDown,
  Calendar,
  MessageSquareText,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { EditableText } from "@/components/editable-text";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { SyncIndicator } from "@/components/sync-indicator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContributorsDialog,
  type ContributorWithStats,
} from "@/components/board/contributors-dialog";
import { TagsDialog, type TagWithStats } from "@/components/board/tags-dialog";
import { ShareDialog } from "@/components/board/share-dialog";
import { useUpdateBoardTitle, useReorderTasks } from "@/hooks/use-board";
import type { TaskReorderMode } from "@/stores/board-store";

interface BoardHeaderProps {
  boardId: string;
  title: string;
  contributors: ContributorWithStats[];
  tags: TagWithStats[];
  /**
   * "bar" is the board page's top bar. "fab" folds the same controls into a
   * floating button, for the full-screen board on the creator desk where the
   * top edge belongs to the desk chrome.
   */
  variant?: "bar" | "fab";
  /** Rendered at the top of the fab menu, e.g. leaving the board. */
  onClose?: () => void;
}

export function BoardHeader({
  boardId,
  title,
  contributors,
  tags,
  variant = "bar",
  onClose,
}: BoardHeaderProps) {
  const [isContributorsOpen, setIsContributorsOpen] = useState(false);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isReorderDialogOpen, setIsReorderDialogOpen] = useState(false);
  const [pendingReorderMode, setPendingReorderMode] = useState<TaskReorderMode | null>(null);
  const { theme, setTheme } = useTheme();

  const updateTitleMutation = useUpdateBoardTitle(boardId);
  const reorderTasksMutation = useReorderTasks(boardId);

  const handleSave = (newTitle: string) => {
    updateTitleMutation.mutate(newTitle);
  };

  const handleMobileAction = (action: () => void) => {
    setIsMobileMenuOpen(false);
    action();
  };

  const handleReorderClick = (mode: TaskReorderMode) => {
    setPendingReorderMode(mode);
    setIsReorderDialogOpen(true);
  };

  const handleReorderConfirm = () => {
    if (pendingReorderMode) {
      reorderTasksMutation.mutate({ mode: pendingReorderMode });
      setIsReorderDialogOpen(false);
      setPendingReorderMode(null);
    }
  };

  const menu = (
    <nav className="flex flex-col gap-1 mt-4">
      <div className="px-2 py-1.5">
        <span className="text-sm font-semibold text-muted-foreground">Reorder Tasks</span>
        <div className="flex flex-col gap-1 mt-1">
          <Button
            variant="ghost"
            className="justify-start gap-3 h-9 text-sm"
            onClick={() => handleMobileAction(() => handleReorderClick("createdAsc"))}
            disabled={reorderTasksMutation.isPending}
          >
            <Calendar className="h-4 w-4" />
            <ArrowUp className="h-4 w-4" />
            <span>Created (oldest first)</span>
          </Button>
          <Button
            variant="ghost"
            className="justify-start gap-3 h-9 text-sm"
            onClick={() => handleMobileAction(() => handleReorderClick("createdDesc"))}
            disabled={reorderTasksMutation.isPending}
          >
            <Calendar className="h-4 w-4" />
            <ArrowDown className="h-4 w-4" />
            <span>Created (newest first)</span>
          </Button>
          <Button
            variant="ghost"
            className="justify-start gap-3 h-9 text-sm"
            onClick={() => handleMobileAction(() => handleReorderClick("lastCommentAsc"))}
            disabled={reorderTasksMutation.isPending}
          >
            <MessageSquareText className="h-4 w-4" />
            <ArrowUp className="h-4 w-4" />
            <span>Last comment (oldest first)</span>
          </Button>
          <Button
            variant="ghost"
            className="justify-start gap-3 h-9 text-sm"
            onClick={() => handleMobileAction(() => handleReorderClick("lastCommentDesc"))}
            disabled={reorderTasksMutation.isPending}
          >
            <MessageSquareText className="h-4 w-4" />
            <ArrowDown className="h-4 w-4" />
            <span>Last comment (newest first)</span>
          </Button>
        </div>
      </div>
      <div className="border-t my-2" />
      <Button
        variant="ghost"
        className="justify-start gap-3 h-11"
        onClick={() => handleMobileAction(() => setIsShareOpen(true))}
      >
        <Share2 className="h-5 w-5" />
        <span>Share Board</span>
      </Button>
      <Button
        variant="ghost"
        className="justify-start gap-3 h-11"
        onClick={() => handleMobileAction(() => setIsContributorsOpen(true))}
      >
        <Users className="h-5 w-5" />
        <span>Contributors</span>
      </Button>
      <Button
        variant="ghost"
        className="justify-start gap-3 h-11"
        onClick={() => handleMobileAction(() => setIsTagsOpen(true))}
      >
        <Tag className="h-5 w-5" />
        <span>Tags</span>
      </Button>
      <Button
        variant="ghost"
        className="justify-start gap-3 h-11"
        asChild
        onClick={() => setIsMobileMenuOpen(false)}
      >
        <Link href={`/boards/${boardId}/emails`}>
          <Mail className="h-5 w-5" />
          <span>Email History</span>
        </Link>
      </Button>
      <div className="border-t my-2" />
      <div className="px-4 py-2">
        <span className="text-sm text-muted-foreground">Theme</span>
        <div className="flex gap-1 mt-2">
          <Button
            variant={theme === "light" ? "secondary" : "ghost"}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => setTheme("light")}
          >
            <Sun className="h-4 w-4" />
            <span>Light</span>
            {theme === "light" && <Check className="h-3 w-3 ml-auto" />}
          </Button>
          <Button
            variant={theme === "dark" ? "secondary" : "ghost"}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => setTheme("dark")}
          >
            <Moon className="h-4 w-4" />
            <span>Dark</span>
            {theme === "dark" && <Check className="h-3 w-3 ml-auto" />}
          </Button>
          <Button
            variant={theme === "system" ? "secondary" : "ghost"}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => setTheme("system")}
          >
            <Monitor className="h-4 w-4" />
            <span>Auto</span>
            {theme === "system" && <Check className="h-3 w-3 ml-auto" />}
          </Button>
        </div>
      </div>
    </nav>
  );

  const dialogs = (
    <>
      <ShareDialog boardId={boardId} open={isShareOpen} onOpenChange={setIsShareOpen} />
      <ContributorsDialog
        boardId={boardId}
        contributors={contributors}
        open={isContributorsOpen}
        onOpenChange={setIsContributorsOpen}
      />
      <TagsDialog boardId={boardId} tags={tags} open={isTagsOpen} onOpenChange={setIsTagsOpen} />

      <Dialog open={isReorderDialogOpen} onOpenChange={setIsReorderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reorder Tasks</DialogTitle>
            <DialogDescription>
              This will reorder tasks for everyone on this board. Are you sure you want to continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsReorderDialogOpen(false);
                setPendingReorderMode(null);
              }}
              disabled={reorderTasksMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleReorderConfirm} disabled={reorderTasksMutation.isPending}>
              {reorderTasksMutation.isPending ? "Reordering..." : "Reorder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (variant === "fab") {
    return (
      <>
        <div className="board-fabs">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button size="icon" className="board-fab" aria-label="Board menu" title="Board menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-y-auto">
              <SheetHeader>
                <SheetTitle asChild>
                  <EditableText
                    value={title}
                    onSave={handleSave}
                    as="h2"
                    className="text-heading-lg"
                    inputClassName="text-heading-lg"
                  />
                </SheetTitle>
              </SheetHeader>
              <div className="px-4">
                <SyncIndicator boardId={boardId} />
              </div>
              {menu}
              {onClose && (
                <div className="mt-2 border-t px-2 pt-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-11"
                    onClick={() => handleMobileAction(onClose)}
                  >
                    <X className="h-5 w-5" />
                    <span>Close board</span>
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>

        {dialogs}
      </>
    );
  }

  return (
    <header className="flex items-center gap-4 border-b glass glass-strong rounded-none px-4 py-3 md:px-6 md:py-4">
      <EditableText
        value={title}
        onSave={handleSave}
        as="h1"
        className="text-heading-lg"
        inputClassName="text-heading-lg"
      />
      <div className="ml-auto flex items-center gap-2">
        <SyncIndicator boardId={boardId} />

        {/* Desktop navigation - hidden on mobile */}
        <div className="hidden md:flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                title="Reorder tasks"
                aria-label="Reorder tasks"
                disabled={reorderTasksMutation.isPending}
              >
                <ArrowUpDown className="h-4 w-4" />
                <span>Reorder</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleReorderClick("createdAsc")}>
                <Calendar className="h-4 w-4" />
                <ArrowUp className="h-4 w-4" />
                <span>Created (oldest first)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleReorderClick("createdDesc")}>
                <Calendar className="h-4 w-4" />
                <ArrowDown className="h-4 w-4" />
                <span>Created (newest first)</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleReorderClick("lastCommentAsc")}>
                <MessageSquareText className="h-4 w-4" />
                <ArrowUp className="h-4 w-4" />
                <span>Last comment (oldest first)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleReorderClick("lastCommentDesc")}>
                <MessageSquareText className="h-4 w-4" />
                <ArrowDown className="h-4 w-4" />
                <span>Last comment (newest first)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => setIsShareOpen(true)}
            title="Share board"
            aria-label="Share board"
          >
            <Share2 className="h-4 w-4" />
            <span>Share</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => setIsContributorsOpen(true)}
            title="Manage contributors"
            aria-label="Manage contributors"
          >
            <Users className="h-4 w-4" />
            <span>Contributors</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => setIsTagsOpen(true)}
            title="Manage tags"
            aria-label="Manage tags"
          >
            <Tag className="h-4 w-4" />
            <span>Tags</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            asChild
            title="Email history"
            aria-label="Email history"
          >
            <Link href={`/boards/${boardId}/emails`}>
              <Mail className="h-4 w-4" />
              <span>Emails</span>
            </Link>
          </Button>
          <ThemeToggle />
        </div>

        {/* Mobile hamburger menu - hidden on desktop */}
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            {menu}
          </SheetContent>
        </Sheet>
      </div>

      {dialogs}
    </header>
  );
}
