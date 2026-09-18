FROM ghcr.io/squaredgroup/squared-workspace-api:latest

USER root

RUN node --input-type=module -e '
import fs from "node:fs";
const path = "/app/dist/src/server-foundation.js";
const before = `await app.register(cors, { origin: config.NODE_ENV === "production" ? false : true });`;
const after = `await app.register(cors, { origin: config.NODE_ENV === "production" ? ["https://workspace.app.squaredgroup.studio"] : true, methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], exposedHeaders: ["ETag", "X-Next-Cursor"], maxAge: 86400 });`;
const source = fs.readFileSync(path, "utf8");
if (!source.includes(before)) throw new Error("CORS production pattern not found; refusing unsafe hotfix");
fs.writeFileSync(path, source.replace(before, after));
const verified = fs.readFileSync(path, "utf8");
if (!verified.includes("https://workspace.app.squaredgroup.studio")) throw new Error("CORS hotfix verification failed");
'

USER workspace
