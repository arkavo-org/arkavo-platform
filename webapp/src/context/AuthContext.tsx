import React, { createContext, useContext, ReactNode } from 'react';
import Keycloak from 'keycloak-js';
import { UserProfile } from '../components/AuthProvider';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userProfile: UserProfile | null;
  keycloak: Keycloak | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  userProfile: null,
  keycloak: null,
  login: async () => {},
  logout: async () => {},
  refreshToken: async () => false,
  hasRole: () => false,
});

interface AuthProviderProps {
  children: ReactNode;
  value: AuthContextType;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, value }) => {
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
