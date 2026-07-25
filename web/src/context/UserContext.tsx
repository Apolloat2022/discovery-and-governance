import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { getCurrentUserId, setCurrentUserId } from "../api/client";
import type { User } from "../api/types";

interface UserContextValue {
  users: User[];
  currentUser: User | null;
  loading: boolean;
  error: string | null;
  selectUser: (userId: string | null) => void;
  /** Governance actions require lead or admin. */
  canGovern: boolean;
  isAdmin: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(getCurrentUserId());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getUsers()
      .then((fetched) => {
        if (cancelled) return;
        setUsers(fetched);
        const stored = getCurrentUserId();
        const validStored = stored && fetched.some((u) => u.id === stored) ? stored : null;
        const initial = validStored ?? fetched[0]?.id ?? null;
        setCurrentUserId(initial);
        setCurrentUserIdState(initial);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load users");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectUser = (userId: string | null) => {
    setCurrentUserId(userId);
    setCurrentUserIdState(userId);
  };

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId],
  );

  const value: UserContextValue = {
    users,
    currentUser,
    loading,
    error,
    selectUser,
    canGovern: currentUser?.role === "admin" || currentUser?.role === "lead",
    isAdmin: currentUser?.role === "admin",
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
