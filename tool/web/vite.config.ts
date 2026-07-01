import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy = {
  "/api": {
    target: "http://127.0.0.1:8000",
    changeOrigin: true
  }
};

const allowedHosts = ["localhost", "yearbooktool.sighton.ca"];

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: apiProxy,
    allowedHosts
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    proxy: apiProxy,
    allowedHosts
  }
});
