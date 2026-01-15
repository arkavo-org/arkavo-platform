import React from 'react';

const Ballot: React.FC = () => {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 60px)' }}>
      <iframe
        src="/ballot-sign/web/public/standalone.html"
        title="Ballot Sign"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '8px'
        }}
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
      />
    </div>
  );
};

export default Ballot;
