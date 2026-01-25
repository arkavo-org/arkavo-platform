import React, { useEffect, useState, useRef } from 'react';
import { AuthProvider as AuthContextProvider } from '../context/AuthContext';
import Keycloak from "keycloak-js";
import { OpenTDF, type AuthProvider as TdfAuthProvider, HttpRequest } from '@opentdf/sdk';
import type { TdfClient } from '../context/AuthContext';

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
      onLoad: 'check-sso',
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
  const [tdfClient, setTdfClient] = useState<TdfClient | null>(null);
  const hasSyncedIdpImage = useRef(false);

  const initializeTdfClient = async () => {
    if (!keycloak?.authenticated) return;

    try {
      if (!keycloak?.token) {
        return;
      }

      const oidcOrigin = `${import.meta.env.VITE_KEYCLOAK_SERVER_URL}/realms/${import.meta.env.VITE_KEYCLOAK_REALM}`;
      const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "web-client";
      const tokenEndpoint = `${oidcOrigin}/protocol/openid-connect/token`;
      const useTokenExchange = import.meta.env.VITE_OPENTDF_USE_TOKEN_EXCHANGE === "true";
      const exchangeAudience = import.meta.env.VITE_OPENTDF_AUDIENCE || "account";
      let cachedToken: { value: string; exp?: number } | null = null;

      const decodeExp = (token: string): number | undefined => {
        try {
          const [, payload] = token.split(".");
          if (!payload) return undefined;
          const decoded = JSON.parse(atob(payload));
          return typeof decoded.exp === "number" ? decoded.exp : undefined;
        } catch {
          return undefined;
        }
      };

      const getKeycloakAccessToken = async (): Promise<string> => {
        await keycloak.updateToken(30);
        if (!keycloak.token) {
          throw new Error("Keycloak access token is missing");
        }
        return keycloak.token;
      };

      const fetchExchangeToken = async (): Promise<string> => {
        const subjectToken = await getKeycloakAccessToken();
        const body = new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: subjectToken,
          subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
          audience: exchangeAudience,
          client_id: clientId,
        });
        const response = await fetch(tokenEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(`Token exchange failed: ${response.status} ${message}`);
        }
        const data = await response.json();
        if (!data.access_token) {
          throw new Error("Token exchange did not return access_token");
        }
        cachedToken = { value: data.access_token, exp: decodeExp(data.access_token) };
        return data.access_token;
      };

      const authProvider: TdfAuthProvider = {
        async updateClientPublicKey(): Promise<void> {
          return;
        },
        async withCreds(httpReq: HttpRequest): Promise<HttpRequest> {
          const now = Math.floor(Date.now() / 1000);
          if (cachedToken?.value && (!cachedToken.exp || cachedToken.exp - now > 60)) {
            return {
              ...httpReq,
              headers: {
                ...httpReq.headers,
                Authorization: `Bearer ${cachedToken.value}`,
              },
            };
          }
          const accessToken = useTokenExchange
            ? await fetchExchangeToken()
            : await getKeycloakAccessToken();
          return {
            ...httpReq,
            headers: {
              ...httpReq.headers,
              Authorization: `Bearer ${accessToken}`,
            },
          };
        },
      };

      const kasEndpoint = import.meta.env.VITE_KAS_ENDPOINT as string | undefined;
      const platformUrl = kasEndpoint
        ? kasEndpoint.replace(/\/kas\/?$/, "")
        : undefined;

      const client = new OpenTDF({
        authProvider,
        platformUrl,
        defaultCreateOptions: {
          defaultKASEndpoint: kasEndpoint,
        },
      });

      const adapter: TdfClient = {
        async encrypt(plainText: string): Promise<ArrayBuffer> {
          const stream = await client.createZTDF({
            source: {
              type: "buffer",
              location: new TextEncoder().encode(plainText),
            },
            autoconfigure: false,
            defaultKASEndpoint: kasEndpoint,
          });
          return new Response(stream).arrayBuffer();
        },
        async decrypt(cipherText: ArrayBuffer): Promise<ArrayBuffer> {
          const stream = await client.read({
            source: {
              type: "buffer",
              location: new Uint8Array(cipherText),
            },
          });
          return new Response(stream).arrayBuffer();
        },
      };

      setTdfClient(adapter);
      console.log('TDF client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize TDF client:', error);
    }
  };

  const convertImageSourceToBase64 = async (source: string): Promise<string | null> => {
    try {
      if (!source) return null;
      if (source.startsWith("data:")) {
        const [, payload] = source.split(",");
        return payload || null;
      }
      const response = await fetch(source);
      if (!response.ok) {
        console.warn("Unable to fetch IdP profile picture:", response.status);
        return null;
      }
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const [, payload] = result.split(",");
          resolve(payload || null);
        };
        reader.onerror = () => reject(new Error("Failed to convert image blob"));
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Error converting IdP picture:", error);
      return null;
    }
  };

  const syncProfilePictureFromIdp = async (idpPicture?: string | null) => {
    if (
      hasSyncedIdpImage.current ||
      !keycloak?.token ||
      !idpPicture
    ) {
      return;
    }

    const lowerSrc = idpPicture.toLowerCase();
    const isDefaultPicture =
      lowerSrc.includes("dummy-image") || lowerSrc.includes("user_3626098");
    if (isDefaultPicture) {
      hasSyncedIdpImage.current = true;
      return;
    }

    try {
      if (keycloak.isTokenExpired()) {
        await keycloak.updateToken(30);
      }

      let existingProfile: Record<string, any> | null = null;
      try {
        const response = await fetch(
          `${import.meta.env.VITE_USERS_API_URL}/profile`,
          {
            headers: {
              Authorization: `Bearer ${keycloak.token}`,
            },
          }
        );
        if (response.ok) {
          existingProfile = await response.json();
        }
      } catch (error) {
        console.debug("Unable to load stored profile for sync:", error);
      }

      if (existingProfile?.picture) {
        hasSyncedIdpImage.current = true;
        return;
      }

      const base64Image = await convertImageSourceToBase64(idpPicture);
      if (!base64Image) return;

      const idpDisplayName =
        keycloak.tokenParsed?.name ||
        keycloak.tokenParsed?.preferred_username ||
        keycloak.tokenParsed?.email ||
        "";

      const payload = {
        ...(existingProfile || {}),
        picture: base64Image,
        email:
          (existingProfile && existingProfile.email) ||
          keycloak.tokenParsed?.email ||
          "",
        display_name:
          existingProfile?.display_name ||
          idpDisplayName,
        name: existingProfile?.name || idpDisplayName,
      };

      await fetch(`${import.meta.env.VITE_USERS_API_URL}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keycloak.token}`,
        },
        body: JSON.stringify(payload),
      });

      hasSyncedIdpImage.current = true;
    } catch (error) {
      console.error("Failed to sync IdP profile picture:", error);
    }
  };

  // Initialize Keycloak
  useEffect(() => {
    const initAuth = async () => {
      try {
        const authenticated = await initializeAuth();
        setIsAuthenticated(authenticated);
        
        if (authenticated) {
          const profile = await getUserProfile();
          if (profile?.picture) {
            await syncProfilePictureFromIdp(profile.picture);
          }
          setUserProfile(profile);
          // Initialize TDF client on first load
          if (!tdfClient) {
            console.log('Initializing TDF client');
            await initializeTdfClient();
          }
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
      hasSyncedIdpImage.current = false;
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const authenticated = await initializeAuth();
      if (!authenticated) {
        await keycloak.login();
        return;
      }
      setIsAuthenticated(true);
      const profile = await getUserProfile();
      setUserProfile(profile);
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
        tdfClient,
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
