#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

test -f Backend/src/config.ts
test -f Backend/src/server-foundation.ts
test -f Backend/.env.example

grep -q 'PUBLIC_API_URL: z.string().url(),' Backend/src/config.ts
grep -q 'origin: config.NODE_ENV === "production" ? false : true' Backend/src/server-foundation.ts

python3 - <<'PY'
from pathlib import Path

config=Path("Backend/src/config.ts")
s=config.read_text()
needle='  PUBLIC_API_URL: z.string().url(),\n'
replacement=needle+'  WEB_APP_ORIGIN: z.string().url().default("https://workspace.app.squaredgroup.studio"),\n'
if 'WEB_APP_ORIGIN:' not in s:
    if needle not in s:
        raise SystemExit("PUBLIC_API_URL anchor missing")
    config.write_text(s.replace(needle,replacement,1))

foundation=Path("Backend/src/server-foundation.ts")
s=foundation.read_text()
before='await app.register(cors, { origin: config.NODE_ENV === "production" ? false : true });'
after='''const webAppOrigin = new URL(config.WEB_APP_ORIGIN).origin;
await app.register(cors, {
  origin: config.NODE_ENV === "production" ? [webAppOrigin] : true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  exposedHeaders: ["ETag", "X-Next-Cursor"],
  maxAge: 86_400
});'''
if 'const webAppOrigin = new URL(config.WEB_APP_ORIGIN).origin;' not in s:
    if before not in s:
        raise SystemExit("CORS anchor missing")
    foundation.write_text(s.replace(before,after,1))

env=Path("Backend/.env.example")
s=env.read_text()
needle='PUBLIC_API_URL=http://localhost:8080\n'
replacement=needle+'# Frontend Web autorisé à appeler l’API en production (CORS).\nWEB_APP_ORIGIN=https://workspace.app.squaredgroup.studio\n'
if 'WEB_APP_ORIGIN=' not in s:
    if needle not in s:
        raise SystemExit("PUBLIC_API_URL env anchor missing")
    env.write_text(s.replace(needle,replacement,1))
PY

echo "CORS hotfix applied for https://workspace.app.squaredgroup.studio"
