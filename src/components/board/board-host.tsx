"use client";

import { createContext, useContext } from "react";

/**
 * Where the board is being rendered. On `/boards/[id]` the URL is the board,
 * so opening a task pushes `?task=`; on the creator desk the board is a panel
 * on `/`, and pushing that URL would navigate off the desk and tear down the
 * live voice session. Embedded hosts drive the sidebar through the store
 * instead, which `TaskSidebarHost` already prefers over the URL.
 */
const BoardHostContext = createContext<{ embedded: boolean }>({ embedded: false });

export const BoardHostProvider = BoardHostContext.Provider;

export function useBoardHost() {
  return useContext(BoardHostContext);
}
