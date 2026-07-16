import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { Server } from 'socket.io';
import { registerHandlers } from './handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true },
});

registerHandlers(io);

// Em produção o build do client é servido pelo mesmo processo.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send('virtual-office server rodando (client/dist ainda não buildado — use o Vite em dev)');
  });
}

const PORT = Number(process.env.PORT ?? 3001);
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] escutando em http://0.0.0.0:${PORT}`);
});
