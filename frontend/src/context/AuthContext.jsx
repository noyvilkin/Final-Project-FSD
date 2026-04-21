/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  login as loginRequest,
  logout as logoutRequest,
  refresh as refreshRequest,
  setUnauthorizedHandler,
  signUp as signUpRequest,
} from "../services/api";

const AuthContext = createContext();
const STORAGE_KEY = "careerpilot_user";

function normalizeUser(userData) {
  if (!userData || typeof userData !== "object") {
    return null;
  }

  const id = userData.id || userData._id || userData.userId || null;
  return {
    ...userData,
    id,
  };
}

function readStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeUser(parsed);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser());
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const storeUser = useCallback((userData) => {
    const normalized = normalizeUser(userData);
    if (!normalized) return null;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    setUser(normalized);
    return normalized;
  }, []);

  const clearUser = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const login = useCallback(
    async ({ email, password }) => {
      const response = await loginRequest({ email, password });
      return storeUser(response?.user);
    },
    [storeUser]
  );

  const signUp = useCallback(
    async (payload) => {
      const response = await signUpRequest(payload);
      return storeUser(response?.user);
    },
    [storeUser]
  );

  const logout = useCallback(
    async ({ remote = true } = {}) => {
      if (remote) {
        try {
          await logoutRequest();
        } catch {
          // Logout is idempotent; clear local session even if API call fails.
        }
      }
      clearUser();
    },
    [clearUser]
  );

  useEffect(() => {
    let isMounted = true;

    const bootstrapAuth = async () => {
      try {
        const response = await refreshRequest();
        if (!isMounted) return;
        storeUser(response?.user);
      } catch {
        if (!isMounted) return;
        clearUser();
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    };

    bootstrapAuth();

    return () => {
      isMounted = false;
    };
  }, [clearUser, storeUser]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout({ remote: false });
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  const value = useMemo(
    () => ({
      isAuthenticated: Boolean(user),
      isAuthLoading,
      user,
      userId: user?.id || null,
      login,
      signUp,
      logout,
    }),
    [isAuthLoading, login, logout, signUp, user]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}