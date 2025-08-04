import React, { createContext, useContext, ReactNode } from 'react';
import Keycloak from 'keycloak-js';
import { UserProfile } from '../components/AuthProvider';
import { AuthProvider as TDFAuthProvider, HttpRequest, NanoTDFDatasetClient } from '@opentdf/sdk';
import { DatasetConfig } from '@opentdf/sdk/nano';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userProfile: UserProfile | null;
  keycloak: Keycloak | null;
  tdfClient: NanoTDFDatasetClient | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  hasRole: (role: string) => boolean;
};

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  userProfile: null,
  keycloak: null,
  tdfClient: null,
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
