# AGENTS.md

## Execution Policy

- Prefer local toolchain when available.
- If local Node/npm is missing or unreliable, run frontend install/build/test in Docker using an official Node image.
- Default Docker command pattern for the OrgPortal web app:

```bash
docker run --rm \
  -v /home/julian/Documents/arkavo-platform/OrgPortal/web:/app \
  -w /app \
  node:24-alpine \
  sh -lc "npm ci && npm run build"
```

- For quick environment verification in Docker:

```bash
docker run --rm node:24-alpine sh -lc "node -v && npm -v"
```
