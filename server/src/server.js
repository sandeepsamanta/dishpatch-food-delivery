import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { closeRealtime, initRealtime } from './realtime/socket.js';

await connectDB();
console.log('MongoDB connected');

// Express and Socket.IO share one HTTP server, so the same port serves the REST API and live updates.
const server = createServer(createApp());
initRealtime(server);
server.listen(env.port, () => console.log(`API + realtime listening on http://localhost:${env.port}`));

const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down`);
  await closeRealtime();
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
