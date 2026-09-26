import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "../services/api";

interface User {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthResponse {
  success: boolean;
  message?: string;
  user: User;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({
  children,
}: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await api.get<AuthResponse>("/auth/me");
      setUser(response.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = async (
    email: string,
    password: string
  ): Promise<void> => {
    const response = await api.post<AuthResponse>("/auth/login", {
      email,
      password,
    });

    setUser(response.user);
  };

  const register = async (
    name: string,
    email: string,
    password: string
  ): Promise<void> => {
    const response = await api.post<AuthResponse>("/auth/register", {
      name,
      email,
      password,
    });

    setUser(response.user);
  };

  const logout = async (): Promise<void> => {
    await api.post("/auth/logout");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside an AuthProvider."
    );
  }

  return context;
};