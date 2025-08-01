import React, { useEffect, useState } from 'react';
import { AuthProvider as AuthContextProvider } from '../context/AuthContext';
import Keycloak from "keycloak-js";

// Configuration from environment variables
const keycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_SERVER_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: "web-client"
};

// Create single Keycloak instance
const keycloak = new Keycloak(keycloakConfig);

export interface UserProfile {
  name: string;
  picture: string;
  email?: string;
  roles?: string[];
}

/**
 * Initializes Keycloak authentication with silent check
 */
const initializeAuth = async (): Promise<boolean> => {
  try {
    const authenticated = await keycloak.init({
      onLoad: 'login-required',
      checkLoginIframe: false,
      enableLogging: true,
      silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html'
    });
    return authenticated;
  } catch (error) {
    console.error("Keycloak initialization failed:", error);
    return false;
  }
};

/**
 * Checks if user has a specific role
 */
const hasRole = (role: string): boolean => {
  if (!keycloak.authenticated) return false;
  return !!(
    keycloak.hasRealmRole(role) || 
    keycloak.hasResourceRole(role)
  );
};

/**
 * Gets current user profile with enhanced data
 */
const getUserProfile = async (): Promise<UserProfile | null> => {
  if (!keycloak.authenticated) return null;

  try {
    await keycloak.updateToken(30);
    const tokenParsed = keycloak.tokenParsed || {};
    
    let profile: UserProfile = {
      name: tokenParsed.name || tokenParsed.preferred_username || "User",
      picture: tokenParsed.picture || "user_3626098.png",
      email: tokenParsed.email,
      roles: tokenParsed.realm_access?.roles || []
    };

    // Try to enhance with userinfo endpoint if available
    try {
      const response = await fetch(
        `${keycloak.authServerUrl}/realms/${keycloak.realm}/protocol/openid-connect/userinfo`,
        {
          headers: { Authorization: `Bearer ${keycloak.token}` },
          signal: AbortSignal.timeout(3000)
        }
      );
      
      if (response.ok) {
        const userInfo = await response.json();
        profile = {
          name: userInfo.name || userInfo.preferred_username || profile.name,
          picture: userInfo.picture || profile.picture,
          email: userInfo.email || profile.email,
          roles: userInfo.realm_access?.roles || profile.roles || []
        };
      }
    } catch (error) {
      console.debug("Using token claims only:", error);
    }

    return profile;
  } catch (error) {
    console.error("Failed to get user profile:", error);
    return null;
  }
};

/**
 * Refreshes token silently
 */
const refreshToken = async (minValidity = 30): Promise<boolean> => {
  try {
    return await keycloak.updateToken(minValidity);
  } catch (error) {
    console.error("Token refresh failed:", error);
    return false;
  }
};

/**
 * Returns the current access token
 */
const getToken = (): string | undefined => {
  return keycloak.token;
};

/**
 * Checks if token is expired or about to expire
 */
const isTokenExpired = (minValidity = 30): boolean => {
  return keycloak.isTokenExpired(minValidity);
};

interface AuthProviderProps {
  children: React.ReactNode;
}

const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Initialize Keycloak
  useEffect(() => {
    const initAuth = async () => {
      try {
        const authenticated = await initializeAuth();
        setIsAuthenticated(authenticated);
        
        if (authenticated) {
          const profile = await getUserProfile();
          setUserProfile(profile);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Set up token refresh
    const interval = setInterval(async () => {
      if (isAuthenticated) {
        await refreshToken();
      }
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const logout = async (redirectUri?: string): Promise<void> => {
    try {
      let returnUrl = redirectUri;
      if (!returnUrl) {
        // Handle different domains appropriately
        if (window.location.hostname === 'dev.app.codecollective.us') {
          returnUrl = 'https://dev.app.codecollective.us';
        } else if (window.location.hostname === 'localhost') {
          returnUrl = 'http://localhost:5173';
        } else {
          returnUrl = window.location.origin;
        }
      }

      const logoutParams = {
        redirectUri: encodeURIComponent(returnUrl),
        id_token_hint: keycloak.idToken
      };

      await keycloak.logout(logoutParams);
      setIsAuthenticated(false);
      setUserProfile(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const authenticated = await initializeAuth();
      setIsAuthenticated(authenticated);
      if (authenticated) {
        const profile = await getUserProfile();
        setUserProfile(profile);
      }
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContextProvider
      value={{
        isAuthenticated,
        isLoading,
        userProfile,
        keycloak,
        login: handleLogin,
        logout: () => {
          try {
            return logout(import.meta.env.VITE_KEYCLOAK_REDIRECT_URL);
          } catch (error) {
            console.error('Logout error:', error);
            return Promise.reject(error);
          }
        },
        refreshToken: () => refreshToken(30),
        hasRole,
      }}
    >
      {children}
    </AuthContextProvider>
  );
};

export default AuthProvider;
