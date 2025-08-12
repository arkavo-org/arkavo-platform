import React from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import './ConnectionStatus.css';

const ConnectionStatus: React.FC = () => {
  const { connectionStatus } = useWebSocket();

  const statusMap = {
    connecting: { text: 'Connecting...', color: 'orange' },
    connected: { text: 'Connected', color: 'green' },
    disconnected: { text: 'Disconnected', color: 'red' },
    error: { text: 'Connection Error', color: 'red' }
  };

  const status = statusMap[connectionStatus];

  return (
    <div className="connection-status" style={{ backgroundColor: status.color }}>
      <div className="status-dot" />
      <span>{status.text}</span>
    </div>
  );
};

export default ConnectionStatus;
