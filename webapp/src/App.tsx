import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import AppRoutes from './AppRoutes';
import { createRoot } from 'react-dom/client';
import { ReactKeycloakProvider } from '@react-keycloak/web';
import keycloak from './keycloak';

const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState(localStorage.getItem('darkMode') === 'true');

  useEffect(() => {
    document.body.classList.toggle('dark-mode', darkMode);
    localStorage.setItem('darkMode', darkMode.toString());

    const applyDarkModeToFeedItems = () => {
      const feedItems = document.querySelectorAll('.feed-item');
      feedItems.forEach((item) => {
        item.classList.toggle('dark-mode', darkMode);
      });
    };

    const observer = new MutationObserver(applyDarkModeToFeedItems);
    observer.observe(document.body, { childList: true, subtree: true });

    applyDarkModeToFeedItems();

    return () => observer.disconnect();
  }, [darkMode]);

  return (
    <ReactKeycloakProvider authClient={keycloak}>
      <Router future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}>
        <AppRoutes darkMode={darkMode} onToggleDarkMode={() => setDarkMode(!darkMode)} />
      </Router>
    </ReactKeycloakProvider>
  );
};

// Render the App
createRoot(document.getElementById('root')!).render(<App />);
export default App;
