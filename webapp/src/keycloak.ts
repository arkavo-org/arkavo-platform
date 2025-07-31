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
}

/**
 * Initializes Keycloak authentication
 */
export const initializeAuth = async (): Promise<boolean> => {
  try {
    const authenticated = await keycloak.init({
      onLoad: 'login-required',
      checkLoginIframe: false
    });
    return authenticated;
  } catch (error) {
    console.error("Keycloak initialization failed:", error);
    return false;
  }
};

/**
 * Gets current user profile
 */
export const getUserProfile = async (): Promise<UserProfile | null> => {
  if (!keycloak.authenticated) return null;

  try {
    await keycloak.updateToken(30);
    const tokenParsed = keycloak.tokenParsed || {};
    
    let profile: UserProfile = {
      name: tokenParsed.name || tokenParsed.preferred_username || "User",
      picture: tokenParsed.picture || "user_3626098.png"
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
          picture: userInfo.picture || profile.picture
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
 * Logs out current user
 */
export const logout = (): void => {
  keycloak.logout();
};

// Export Keycloak instance for direct access when needed
export default keycloak;
