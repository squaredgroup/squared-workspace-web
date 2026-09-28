import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

const staticEntries = ["404.html", "CNAME", ".nojekyll", "manifest.webmanifest", "_worker.js", "_routes.json", "_headers", "assets", "js"];

async function filesUnder(directory: string, prefix = ""): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(join(directory, entry.name), relative));
    else output.push(relative);
  }
  return output;
}

function workspaceStaticAssets(): Plugin {
  return {
    name: "workspace-static-assets",
    apply: "build",
    async closeBundle() {
      await mkdir("dist", { recursive: true });
      for (const entry of staticEntries) await cp(entry, join("dist", entry), { recursive: true });
      const releaseHash = createHash("sha256");
      for (const file of (await filesUnder("dist")).sort()) {
        if (file === "sw.js" || file === "release.json") continue;
        releaseHash.update(file).update(await readFile(join("dist", file)));
      }
      const release = releaseHash.digest("hex").slice(0, 12);
      const source = await readFile("sw.js", "utf8");
      const serviceWorker = source.replaceAll("__SQUARED_RELEASE__", release);
      await writeFile("dist/sw.js", serviceWorker);
      await writeFile("dist/release.json", JSON.stringify({ release }));
      const index = await readFile("dist/index.html", "utf8");
      await writeFile("dist/index.html", index.replaceAll("__SQUARED_RELEASE__", release));
    }
  };
}

export default defineConfig({
  plugins: [tailwindcss(), workspaceStaticAssets()],
  server: {
    proxy: {
      "/api": {
        target: "https://workspace.squaredgroup.studio",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, "")
      }
    }
  },
  build: {
    target: "es2022",
    sourcemap: true,
    manifest: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/workspace-[hash].js",
        chunkFileNames: "assets/module-[hash].js",
        assetFileNames: "assets/workspace-[hash][extname]"
      }
    }
  }
});
