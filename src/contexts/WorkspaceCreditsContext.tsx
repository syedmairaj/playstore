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

type WorkspaceCreditsContextValue = {
  balance: number;
  setBalance: (next: number) => void;
  /** Apply a debit/charge when the server omits balanceAfter. */
  applyCreditDelta: (delta: number) => void;
};

const WorkspaceCreditsContext = createContext<WorkspaceCreditsContextValue | null>(
  null,
);

export function WorkspaceCreditsProvider({
  initialBalance,
  children,
}: {
  initialBalance: number;
  children: ReactNode;
}) {
  const [balance, setBalanceState] = useState(initialBalance);

  useEffect(() => {
    setBalanceState(initialBalance);
  }, [initialBalance]);

  const setBalance = useCallback((next: number) => {
    setBalanceState(Math.max(0, next));
  }, []);

  const applyCreditDelta = useCallback((delta: number) => {
    setBalanceState((prev) => Math.max(0, prev + delta));
  }, []);

  const value = useMemo(
    () => ({ balance, setBalance, applyCreditDelta }),
    [balance, setBalance, applyCreditDelta],
  );

  return (
    <WorkspaceCreditsContext.Provider value={value}>
      {children}
    </WorkspaceCreditsContext.Provider>
  );
}

export function useWorkspaceCredits(): WorkspaceCreditsContextValue | null {
  return useContext(WorkspaceCreditsContext);
}
