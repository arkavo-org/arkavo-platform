import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import AppRoutes from './AppRoutes';
import { createRoot } from 'react-dom/client';
import AuthProvider from './components/AuthProvider';
import { WebSocketProvider } from './context/WebSocketContext';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <Router future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}>
          <AppRoutes />
        </Router>
      </WebSocketProvider>
    </AuthProvider>
  );
};

// Render the App
createRoot(document.getElementById('root')!).render(<App />);
export default App;
