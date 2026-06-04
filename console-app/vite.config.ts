import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Ensures /env.js runs before the Vite bundle (runtime API URL in Docker). */
function injectRuntimeEnvScript(): import("vite").Plugin {
  return {
    name: "inject-runtime-env-script",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const withoutEnv = html.replace(
          /\s*<script src="\/env\.js"><\/script>\s*/g,
          "\n",
        );
        if (withoutEnv.includes('src="/env.js"')) {
          return withoutEnv;
        }
        return withoutEnv.replace(
          "<head>",
          '<head>\n    <script src="/env.js"></script>',
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), injectRuntimeEnvScript()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 4000,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
      "/deployments": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 4000,
  },
});
