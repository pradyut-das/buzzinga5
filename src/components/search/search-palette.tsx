"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface SearchResult {
  id: string;
  type:
    | "task_title"
    | "task_block"
    | "comment"
    | "asset"
    | "topic"
    | "community"
    | "broadcast"
    | "client";
  title: string;
  snippet: string;
  clientName: string | null;
  route: string;
}

const GROUP_ORDER: SearchResult["type"][] = [
  "task_title",
  "task_block",
  "comment",
  "asset",
  "topic",
  "community",
  "broadcast",
  "client",
];

const GROUP_LABEL: Record<SearchResult["type"], string> = {
  task_title: "Tasks",
  task_block: "Tasks",
  comment: "Comments",
  asset: "Assets",
  topic: "Topics",
  community: "Communities",
  broadcast: "Broadcasts",
  client: "Clients",
};

function groupResults(results: SearchResult[]): Map<string, SearchResult[]> {
  const groups = new Map<string, SearchResult[]>();
  for (const result of results) {
    const label = GROUP_LABEL[result.type];
    const list = groups.get(label) ?? [];
    list.push(result);
    groups.set(label, list);
  }
  return groups;
}

/** Module-level opener so a header trigger can open the single mounted palette. */
let paletteOpener: (() => void) | null = null;
function setPaletteOpener(fn: (() => void) | null) {
  paletteOpener = fn;
}
export function openSearchPalette() {
  paletteOpener?.();
}

export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((raw: string) => {
    const q = raw.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    void fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { results: SearchResult[] } | null) => setResults(data?.results ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(query), 180);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, runSearch]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    setPaletteOpener(() => setOpen(true));
    return () => setPaletteOpener(null);
  }, []);

  const select = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setQuery("");
      setResults([]);
      router.push(result.route);
    },
    [router],
  );

  const groups = groupResults(results);
  const shown = GROUP_ORDER.filter((type) => {
    const label = GROUP_LABEL[type];
    return (groups.get(label)?.length ?? 0) > 0;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Search</DialogTitle>
        <DialogDescription>Search across tasks, comments, docs and assets.</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search tasks, comments, docs, assets…"
            autoFocus
          />
          <CommandList>
            {!searched && (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                Type at least 2 characters to search across the workspace.
              </div>
            )}
            {searched && loading && results.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground">Searching…</div>
            )}
            {searched && !loading && results.length === 0 && (
              <CommandEmpty>No results for &ldquo;{query}&rdquo;.</CommandEmpty>
            )}
            {shown.map((type) => {
              const label = GROUP_LABEL[type];
              return (
                <CommandGroup key={label} heading={label}>
                  {groups.get(label)!.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={`${result.title} ${result.snippet}`}
                      onSelect={() => select(result)}
                      className="flex items-start gap-3 py-3"
                    >
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          "bg-muted text-muted-foreground",
                        )}
                      >
                        {type === "task_block" ? "Block" : type.replace("_", " ")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-medium">{result.title}</span>
                          {result.clientName && (
                            <span className="truncate text-xs text-muted-foreground">
                              {result.clientName}
                            </span>
                          )}
                        </span>
                        <span
                          className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground"
                          dangerouslySetInnerHTML={{ __html: result.snippet }}
                        />
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** Static trigger used in the dashboard header; opens the ⌘K palette. */
export function SearchTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => openSearchPalette()}
      className={cn(
        "flex h-9 w-full max-w-64 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted",
        className,
      )}
    >
      <SearchIcon />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        ⌘K
      </kbd>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
