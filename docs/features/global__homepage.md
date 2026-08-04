# Feature: Homepage

## Overview

The landing page where users sign in, create new boards, and access recently visited boards.

## User Flows

### Create a New Board

- User visits homepage (`/`)
- Clicks "Create a Board" button
- New board created with default columns: "📥 To do", "🔄 Doing", "✅ Done", and "📦 Archive" (collapsed by default)
- Board title defaults to "{emoji} New board" with a random emoji prefix
- User automatically redirected to new board (`/boards/{uuid}`)

### Sign In

- Signed-out visitors see `Sign in to create a board`, which links to `/login`
- Boards require an account, so recent-board links also route through `/login` when signed out

### Recent Boards

- When a user visits any board, it is saved to localStorage
- On the homepage, a "Recent Boards" section displays previously visited boards
- Boards are sorted by most recently visited
- Maximum of 20 boards stored
- If no boards have been visited, the section is hidden

### Forget a Board

- Each board in the Recent Boards list has a "forget" button (X icon) that appears on hover
- Clicking the button opens a confirmation dialog
- Confirming removes the board from the Recent Boards list (localStorage only)
- The board itself is not deleted — other users can still access it, and the current user can access it again via the direct link

## Technical Notes

- Recent boards are stored in localStorage under the key `itacorubi:visited-boards`
- Structure: `Array<{ id: string, title: string, visitedAt: string }>`
- The `TrackBoardVisit` client component handles saving on board load
- The `RecentBoards` client component reads and displays the list on homepage
- Hook: `useVisitedBoards()` in `src/lib/use-visited-boards.ts` returns `{ boards, forget }`
- Function: `forgetBoard(id)` removes a board from localStorage
