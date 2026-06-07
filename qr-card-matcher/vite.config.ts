import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8888,
    strictPort: false,
    host: process.env.TAURI_DEV_HOST || "127.0.0.1",
    watch: {
      // Ignore ALL of src-tauri to prevent reload loops from Gradle builds
      ignored: ["**/src-tauri/**"],
    },
  },
  // Vite options tailored for Tauri development
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
});
