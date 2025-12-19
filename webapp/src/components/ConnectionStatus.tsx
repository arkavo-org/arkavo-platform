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
    <div
      className={`connection-status ${connectionStatus}`}
      style={{ backgroundColor: status.color }}
      title={status.text}
      aria-label={status.text}
    >
      <div className="status-dot" />
    </div>
  );
};

export default ConnectionStatus;
