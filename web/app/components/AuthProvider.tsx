import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
  initialAuthenticated = false,
}: {
  children: React.ReactNode;
  initialAuthenticated?: boolean;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(initialAuthenticated);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function init() {
      const { auth } = await import("~/services/firebase.client");
      const { onIdTokenChanged } = await import("firebase/auth");

      unsub = onIdTokenChanged(auth, async (firebaseUser) => {
        if (!firebaseUser) {
          setUser(null);
          setLoading(false);
          return;
        }

        try {
          const idToken = await firebaseUser.getIdToken();
          await fetch("/api/auth/session", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          });
        } catch (err) {
          console.warn("[auth] failed to sync session cookie", err);
        }

        setUser(firebaseUser);
        setLoading(false);
      });
    }

    init();

    return () => {
      unsub?.();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
