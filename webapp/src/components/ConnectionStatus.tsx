import React from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import './ConnectionStatus.css';

const ConnectionStatus: React.FC = () => {
  const { connectionStatus } = useWebSocket();

  const connectedColor = '#c65c1a';
  const disconnectedColor = '#d64545';

  const statusMap = {
    connecting: { text: 'Connecting...', color: connectedColor },
    connected: { text: 'Connected', color: connectedColor },
    disconnected: { text: 'Disconnected', color: disconnectedColor },
    error: { text: 'Connection Error', color: disconnectedColor }
  };

  const status = statusMap[connectionStatus];

  return (
    <div
      className={`connection-status ${connectionStatus}`}
      style={{ backgroundColor: status.color }}
      title={status.text}
      aria-label={status.text}
      role="status"
    >
    </div>
  );
};

export default ConnectionStatus;
