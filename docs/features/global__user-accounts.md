# Feature: User Accounts

## Overview

Accounts are required to reach any board. Signing in also collects the boards a person works on into the sidebar, on any device.

## User Flows

### Sign Up

- Click `Sign in to create a board` on the homepage, then `Sign up` (or go to `/signup`)
- Enter name, email and password (minimum 8 characters)
- Account is created and the user is redirected to the homepage
- Duplicate emails are rejected with "An account with this email already exists"

### Sign In

- Go to `/login` (sidebar `Sign in` links here with a `?next=` return path)
- Enter email and password
- Wrong email or password shows the same message: "Invalid email or password"
- On success the user is redirected to `?next=` when present, otherwise the homepage

### Sign Out

- Click `Sign out` at the bottom of the sidebar
- Session is deleted server-side, cookie is cleared, user lands on the homepage

### Joining Boards

A signed-in user becomes a member of a board when they:

- create it (they become the `owner`), or
- unlock it with the correct password, or
- open a board they already have a valid password cookie for

Membership is what puts a board in the sidebar. Members no longer need the password cookie to open the board.

## Notes

- Sessions live 30 days and slide forward when less than a third of that remains
- Every `/boards/*` route is gated: middleware redirects requests without a session cookie to `/login?next={path}`, and the layout re-checks the session against the database
- The board password is still required on top of the account, until the board is joined
