"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  persistWorkspaceAppId,
  readPersistedWorkspaceAppId,
} from "@/lib/client/workspace-app-sync";

export type WorkspaceAppContextValue = {
  workspaceId: string;
  /** Selected app id for the current workspace (shared across dashboard modules). */
  workspaceAppId: string | null;
  setWorkspaceAppId: (appId: string | null) => void;
};

const WorkspaceAppContext = createContext<WorkspaceAppContextValue | null>(null);

export function WorkspaceAppContextProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const [workspaceAppId, setWorkspaceAppIdState] = useState<string | null>(() =>
    readPersistedWorkspaceAppId(workspaceId),
  );

  useEffect(() => {
    setWorkspaceAppIdState(readPersistedWorkspaceAppId(workspaceId));
  }, [workspaceId]);

  const setWorkspaceAppId = useCallback(
    (appId: string | null) => {
      const normalized = appId?.trim() ? appId.trim() : null;
      setWorkspaceAppIdState(normalized);
      persistWorkspaceAppId(workspaceId, normalized);
    },
    [workspaceId],
  );

  const value = useMemo(
    () => ({
      workspaceId,
      workspaceAppId,
      setWorkspaceAppId,
    }),
    [workspaceId, workspaceAppId, setWorkspaceAppId],
  );

  return (
    <WorkspaceAppContext.Provider value={value}>
      {children}
    </WorkspaceAppContext.Provider>
  );
}

export function useWorkspaceApp(): WorkspaceAppContextValue {
  const context = useContext(WorkspaceAppContext);
  if (!context) {
    throw new Error("useWorkspaceApp must be used within WorkspaceAppContextProvider");
  }
  return context;
}
