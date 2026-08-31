import express from "express";
import path from "path";
import fetch from "node-fetch";
import proxyRouter from "./server/server.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(proxyRouter);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    // Dynamic import to avoid issues in prod
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Use *all for Express v5
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
