import { createContext, useContext, useState } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    Boolean(localStorage.getItem("user"))
  );

  const login = (userData) => {
    localStorage.setItem("user", JSON.stringify(userData));
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem("user");
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}