// bluesky.go
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/Nerzal/gocloak/v12"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Configuration variables
var (
	BLUESKY_PDS_URL string
	ENCRYPTION_KEY  string
)

// Type definitions
type BlueskyCredentials struct {
	Handle      string `json:"handle"`
	AccessToken string `json:"accessToken"`
	DID         string `json:"did"`
}

type BlueskyMessage struct {
	URI       string    `json:"uri"`
	Text      string    `json:"text"`
	Timestamp time.Time `json:"createdAt"`
	Author    string    `json:"author"`
}

type Message struct {
	ID        uuid.UUID `json:"id"`
	Sender    string    `json:"sender"`
	Recipient string    `json:"recipient"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

type BlueskyAPI struct {
	client  *http.Client
	baseURL string
}

// Initialize Bluesky configuration
func bluesky_init() {
	BLUESKY_PDS_URL = os.Getenv("BLUESKY_HOST")
	ENCRYPTION_KEY = os.Getenv("ENCRYPTION_KEY")
}

// Create a new Bluesky account
func bluesky_createaccount(ctx context.Context, userID, email string) error {
	// Generate a random password
	password := generateRandomPassword()

	// Create request body
	body := struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}{
		Email:    email,
		Password: password,
	}

	// Marshal request body
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("failed to marshal request body: %w", err)
	}

	// Create HTTP request
	url := BLUESKY_PDS_URL + "/xrpc/com.atproto.server.createAccount"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Add context and headers
	req = req.WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")

	// Send request
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("request failed with status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var creds BlueskyCredentials
	if err := json.NewDecoder(resp.Body).Decode(&creds); err != nil {
		return fmt.Errorf("failed to decode response: %w", err)
	}

	// Encrypt password
	encryptedPassword, err := encrypt([]byte(ENCRYPTION_KEY), password)
	if err != nil {
		return fmt.Errorf("failed to encrypt password: %w", err)
	}

	// Prepare Keycloak attributes
	attributes := map[string][]string{
		"bluesky_handle":   {creds.Handle},
		"bluesky_password": {encryptedPassword},
	}

	// Update Keycloak user attributes
	if err := keycloak_refreshtoken(ctx); err != nil {
		return fmt.Errorf("failed to refresh token: %w", err)
	}

	// Update the user in Keycloak with the new attributes
	err = client.UpdateUser(ctx, adminToken.AccessToken, userRealm, gocloak.User{
		ID:         &userID,
		Attributes: &attributes,
	})
	if err != nil {
		return fmt.Errorf("failed to update user attributes: %w", err)
	}

	return nil
}

// Send a message to another user via Bluesky
func bluesky_sendmessage(c *gin.Context) {
	var req struct {
		RecipientHandle string `json:"recipient_handle"`
		Message         string `json:"message"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
		return
	}

	senderUserID := c.GetString("user_id")
	senderCreds, err := getBlueskyCredentials(c.Request.Context(), senderUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get sender credentials: %v", err)})
		return
	}

	msg := Message{
		ID:        uuid.New(),
		Sender:    senderUserID,
		Recipient: req.RecipientHandle,
		Message:   req.Message,
		Timestamp: time.Now(),
	}

	blueskyAPI := &BlueskyAPI{
		client:  http.DefaultClient,
		baseURL: BLUESKY_PDS_URL,
	}

	if err := blueskyAPI.SendMessage(c.Request.Context(), senderCreds, req.RecipientHandle, msg.Message); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to send message: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "Message sent successfully"})
}

// Handler for getting user data
func keycloak_getuserdataHandler(c *gin.Context) {
	userID := c.Query("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id query parameter is required"})
		return
	}

	userData, err := keycloak_getuserdata(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get user data: %v", err)})
		return
	}

	c.JSON(http.StatusOK, userData)
}

// Get messages for a user
func bluesky_getmessagesHandler(c *gin.Context) {
	// Get user ID from context (set by AuthMiddleware)
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Get user's Bluesky credentials
	userData, err := keycloak_getuserdata(c.Request.Context(), userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get user credentials: %v", err)})
		return
	}

	// Create Bluesky API client
	api := &BlueskyAPI{
		client:  http.DefaultClient,
		baseURL: BLUESKY_PDS_URL,
	}

	// Convert user data to Bluesky credentials
	creds := &BlueskyCredentials{
		Handle:      userData["handle"].(string),
		AccessToken: userData["access_token"].(string),
	}

	// Get messages
	messages, err := api.bluesky_getmessages(c.Request.Context(), creds)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get messages: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

// Get messages for a user from Bluesky
func (api *BlueskyAPI) bluesky_getmessages(ctx context.Context, creds *BlueskyCredentials) ([]BlueskyMessage, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", api.baseURL+"/xrpc/app.bsky.feed.getTimeline", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+creds.AccessToken)

	resp, err := api.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get messages: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get messages: status %d", resp.StatusCode)
	}

	var result struct {
		Feed []struct {
			Post BlueskyMessage `json:"post"`
		} `json:"feed"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	messages := make([]BlueskyMessage, 0, len(result.Feed))
	for _, item := range result.Feed {
		messages = append(messages, item.Post)
	}

	return messages, nil
}

// Helper function to get Bluesky credentials
func getBlueskyCredentials(ctx context.Context, userID string) (*BlueskyCredentials, error) {
	// TODO: Implement credential retrieval from storage
	return nil, fmt.Errorf("not implemented")
}

// Helper method to send messages
func (api *BlueskyAPI) SendMessage(ctx context.Context, creds *BlueskyCredentials, recipient, message string) error {
	// TODO: Implement message sending via Bluesky API
	return fmt.Errorf("not implemented")
}
