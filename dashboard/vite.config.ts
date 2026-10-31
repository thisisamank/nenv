import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const worker = "http://localhost:8787";

export default defineConfig({
  base: "/dashboard/",
  plugins: [react()],
  build: { outDir: "dist/dashboard", emptyOutDir: true },
  server: {
    proxy: {
      "/v1": worker,
      "/dashboard/session": { target: worker, headers: { Origin: worker } },
    },
  },
});
