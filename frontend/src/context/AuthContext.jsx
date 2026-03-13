import { createContext, useContext, useState } from "react";

const AuthContext = createContext();

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
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeUser(parsed);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser());
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(user));

  const login = (userData) => {
    const normalized = normalizeUser(userData);
    if (!normalized) return;

    localStorage.setItem("user", JSON.stringify(normalized));
    setUser(normalized);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem("user");
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        userId: user?.id || null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}