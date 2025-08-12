import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

interface WebSocketContextType {
  ws: WebSocket | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
}

const WebSocketContext = createContext<WebSocketContextType>({ 
  ws: null,
  connectionStatus: 'disconnected'
});

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { keycloak } = useAuth();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >('disconnected');

  useEffect(() => {
    if (!keycloak?.authenticated) {
      if (ws) {
        ws.close();
        setWs(null);
      }
      return;
    }

    const wss_url = `${import.meta.env.VITE_USERS_WSS_URL}/ws`;
    setConnectionStatus('connecting');
    const socket = new WebSocket(wss_url);

    const handleAuth = async () => {
      try {
        if (keycloak?.isTokenExpired()) {
          await keycloak.updateToken(30);
        }

        const token = keycloak?.token;
        if (!token) {
          console.error("No token available for WebSocket auth");
          socket.close();
          return;
        }

        socket.send(
          JSON.stringify({
            type: "auth",
            token: token,
          })
        );
      } catch (error) {
        console.error("Error during WebSocket auth:", error);
        socket.close();
      }
    };

    socket.onopen = handleAuth;
    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnectionStatus('error');
    };
    socket.onclose = (event) => {
      console.log(`WebSocket closed: ${event.code} - ${event.reason}`);
      setWs(null);
      setConnectionStatus('disconnected');
    };

    socket.onopen = () => {
      setConnectionStatus('connected');
      handleAuth();
    };
    setWs(socket);

    return () => {
      socket.close();
    };
  }, [keycloak?.authenticated, keycloak?.token]);

  return (
    <WebSocketContext.Provider value={{ ws, connectionStatus }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);
