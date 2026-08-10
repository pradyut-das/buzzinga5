# ADR 021: Shared Logic Patterns

Extract duplicated business logic into shared library functions when the same operation is performed in multiple places (API routes, cron jobs, actions).

- Prevents logic drift between implementations
- Enables per-item error isolation when processing collections
- Keeps route handlers thin (auth + call shared function + format response)
- Makes testing easier (test the shared function once)

## When to Extract

Extract shared logic when:

1. **Same operation in multiple entry points** — e.g., processing notifications from both cron and manual API
2. **Complex multi-step operations** — fetch, transform, save, cleanup
3. **Operations on collections** — where one item failing shouldn't block others

## Error Isolation Pattern

When processing a collection of items (boards, recipients, files), isolate errors per-item:

```typescript
// BAD: One failure blocks all
for (const item of items) {
  await processItem(item); // throws on error
}

// GOOD: Errors are isolated per item
const results: ProcessResult[] = [];
for (const item of items) {
  try {
    const result = await processItem(item);
    results.push({ itemId: item.id, success: true, ...result });
  } catch (error) {
    console.error(`Failed to process ${item.id}:`, error);
    results.push({
      itemId: item.id,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
```

## Shared Function Structure

```typescript
// src/lib/process-something.ts

export interface ProcessOptions {
  // Configuration passed by caller
}

export interface ProcessResult {
  processed: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

export async function processSomething(
  scopeId: string,
  options: ProcessOptions
): Promise<ProcessResult> {
  // 1. Fetch data scoped to scopeId
  // 2. Process with per-item error handling
  // 3. Cleanup/side effects
  // 4. Return detailed results
}
```

## Route Handler Pattern

Route handlers become thin wrappers:

```typescript
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { boardId } = await params;

  // 1. Auth
  try {
    await requireBoardAccess(boardId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Call shared function
  try {
    const result = await processSomething(boardId, { /* options */ });
    return NextResponse.json({ message: "Success", ...result });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Failed", details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
```

## Examples in Codebase

- `src/lib/process-board-notifications.ts` — shared notification processing for cron + manual trigger
- `src/lib/notifications.ts` — notification queueing helpers used by multiple actions
