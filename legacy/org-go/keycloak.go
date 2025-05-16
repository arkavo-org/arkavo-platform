// keycloak.go
package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/Nerzal/gocloak/v12"
	"github.com/gin-gonic/gin"
)

var (
	keycloakURL string
	adminRealm  string
	username    string
	password    string
	client      *gocloak.GoCloak
	adminToken  *gocloak.JWT
	userRealm   string
	err         error
)

func keycloak_initialize() error {
	// Keycloak configuration
	keycloakURL = os.Getenv("KEYCLOAK_SERVER_URL")
	adminRealm = "master"
	username = os.Getenv("KEYCLOAK_ADMIN")
	password = os.Getenv("KEYCLOAK_ADMIN_PASSWORD")
	userRealm = "opentdf"
	client = gocloak.NewClient(keycloakURL)
	client.RestyClient().SetTLSClientConfig(&tls.Config{InsecureSkipVerify: false})

	fmt.Printf("Connecting to Keycloak at: %v\n", keycloakURL)
	fmt.Println("Authenticating admin...")

	ctx := context.Background()
	var err error
	adminToken, err = client.LoginAdmin(ctx, username, password, adminRealm)
	if err != nil {
		return fmt.Errorf("failed to login admin: %w", err)
	}

	fmt.Println("Successfully authenticated admin!")
	return nil
}

func keycloak_refreshtoken(ctx context.Context) error {
	// Check if the token has expired or is close to expiring
	if adminToken == nil || adminToken.ExpiresIn < 300 {
		fmt.Println("Refreshing admin token...")
		var err error
		adminToken, err = client.LoginAdmin(ctx, username, password, adminRealm)
		if err != nil {
			return fmt.Errorf("failed to refresh token: %w", err)
		}
		fmt.Println("Admin token refreshed successfully!")
	}
	return nil
}

func keycloak_getusers(ctx context.Context) ([]*gocloak.User, error) {
	if err := keycloak_refreshtoken(ctx); err != nil {
		return nil, fmt.Errorf("failed to ensure token validity: %w", err)
	}
	users, err := client.GetUsers(ctx, adminToken.AccessToken, userRealm, gocloak.GetUsersParams{})
	if err != nil {
		return nil, fmt.Errorf("failed to fetch users: %w", err)
	}
	return users, nil
}

// AuthMiddleware authenticates the user and stores their data in the context
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "no authorization header"})
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")

		// Verify token using Keycloak's public key
		_, claims, err := client.DecodeAccessToken(c.Request.Context(), token, userRealm)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		// Extract user ID from claims
		userID, ok := (*claims)["sub"].(string)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			return
		}

		// Get user data from Keycloak
		userData, err := keycloak_getuserdata(c.Request.Context(), userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to get user data"})
			return
		}

		// Store user data and claims in context
		c.Set("userData", userData)
		c.Set("user_id", userID)
		c.Set("claims", claims)

		c.Next()
	}
}

// keycloak_getuserdata retrieves a user's data from Keycloak
func keycloak_getuserdata(ctx context.Context, userID string) (map[string]interface{}, error) {
	if err := keycloak_refreshtoken(ctx); err != nil {
		return nil, fmt.Errorf("failed to ensure token validity: %w", err)
	}

	// Get user from Keycloak
	user, err := client.GetUserByID(ctx, adminToken.AccessToken, userRealm, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	if user.Attributes == nil {
		return nil, fmt.Errorf("user has no Bluesky credentials")
	}

	attrs := *user.Attributes
	handle := attrs["bluesky_handle"]
	encryptedPassword := attrs["bluesky_password"]

	if len(handle) == 0 || len(encryptedPassword) == 0 {
		return nil, fmt.Errorf("user has incomplete Bluesky credentials")
	}

	// Decrypt password
	password, err := decrypt([]byte(os.Getenv("ENCRYPTION_KEY")), encryptedPassword[0])
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt password: %w", err)
	}

	// Return user data as a map
	return map[string]interface{}{
		"user_id":  userID,
		"handle":   handle[0],
		"password": password,
	}, nil
}
