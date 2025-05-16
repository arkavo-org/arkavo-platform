# Arkavo 
## An Open Source Secure Messaging Platform

This is the web app, which you can customize how you'd like.

### How to Run
1. Fork this Repository to your own account

2. Clone it from your account
```bash
git clone https://github.com/yourusername/devsecops/
```

3. Navigate to the webapp base directory
```bash
cd devsecops/webapp
```

4. Make sure to get the latest Node
Linux:
```bash
# Install nvm and openssl
wget -q -O- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash 
. ~/.bashrc
nvm install node
```

5. Copy the necessary environment
```bash
cp .env.example .env
cp vite.config.ts.template vite.config.ts
cp src/css/global.css.default src/css/global.css
```

6. Generate a self-signed certificate
```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
```

7. Copy the following into vite.config.ts . (Production environment uses Nginx for HTTPS. For development not requiring Nginx or Docker we will use the Vite server)
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Paths to SSL certificate and key
const certPath = path.resolve(__dirname, 'cert.pem');
const keyPath = path.resolve(__dirname, 'key.pem');

// Ensure SSL files exist
if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  throw new Error('SSL certificate or key file not found. Please check the certs directory.');
}

// Vite configuration
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    allowedHosts: ['*'], // Allow all hosts
    host: '0.0.0.0',
    hmr: false,
    https: {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000, // Increase the limit to 1 MB
  },
});
```

8. Install Node 23 on your machine (or use Docker)
9. Run in Development Mode
```bash
npm install
npm run dev
```

10. Optional: Run in Production Mode
```bash
npm install 
npm run build
```
