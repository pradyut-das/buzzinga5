# Feature: Boards

## Overview

Boards are the top-level container for organizing work. Each board has its own columns, tasks, and contributors. Boards are password-protected — a password (or board membership for a signed-in user, see [global\_\_user-accounts.md](global__user-accounts.md)) is required to access board content.

## User Flows

### Create a Board

- Click "Create a Board" on the homepage (signed out, the button is `Sign in to create a board`)
- Dialog appears with title and password fields (both prefilled with suggestions)
- Password field has eye icon to toggle visibility
- User can use suggested values or enter custom title/password
- Both fields are required — cannot be empty
- Board is created and user is redirected to the board
- A signed-in creator becomes the board `owner`

### Access a Board

- Direct link format: `/boards/{uuid}`
- Signing in is required: visitors without a session are redirected to `/login?next={path}`
- Members of the board are then let straight in, no password needed
- Otherwise, if the password cookie is not set, redirects to `/boards/{uuid}/unlock`
- Password entry page prompts for password
- On correct password, cookie is set and user is redirected to board
- On incorrect password, error message is shown

### Unlock a Board

- Navigate to `/boards/{uuid}/unlock`
- Enter board password (eye icon to toggle visibility)
- Password can be prefilled via query parameter: `/boards/{uuid}/unlock?password={password}`
- Password is verified against the board’s stored password hash
- On success: cookie is set, redirect to board; a signed-in user also joins the board
- On failure: error message displayed
- User must click "Unlock Board" button to proceed (no auto-unlock)

### Share a Board

- Click "Share" button in board header (next to Contributors)
- Share dialog shows two sections:

**Share with Password:**

- Board URL (copy button)
- Password field (hidden by default, eye icon to reveal, copy button)
- Password fetched from HTTP-only cookie via API

**Public Link:**

- URL format: `/boards/{uuid}/unlock?password={password}`
- Clicking this link opens unlock page with password prefilled
- User must still click "Unlock Board" button to access the board
- Description: "Anyone with this link will have the password prefilled, but still needs to click unlock"

### Rename a Board

- Click on board title in the header
- Edit inline
- Auto-saves after 1 second or on Enter/blur
- Title is saved in plaintext

### Change Board Password

- Click "Share" button in board header
- Click "Change Password" button in the share dialog
- Warning dialog appears explaining consequences:
  - Anyone with the old password will lose access
  - They will need to enter the new password to unlock the board
  - This action cannot be undone
- Enter new password and confirm password
- Submit the form
- Success toast confirms password update
- Person changing password remains logged in automatically
- Users with old password:
  - Will be redirected to unlock page when accessing board
  - Old password will show "Invalid password" error
  - Must enter new password to unlock board
