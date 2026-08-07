import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El proxy reenvia /auth y /api al backend dentro de la red de Docker Compose
// (servicio "backend"). Asi el navegador solo habla con este servidor Vite
// (mismo origen que la pagina), evitando el problema de cookies cross-site que
// tendria una cookie HTTP-only entre dos puertos/origenes distintos sin HTTPS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://backend:4000",
      "/api": "http://backend:4000",
    },
  },
});
