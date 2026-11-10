import { io } from 'socket.io-client';
import { getToken } from './client';

const URL = import.meta.env.VITE_API_URL || undefined; // undefined = same origin (dev proxy)

/** Opens an authenticated socket for the current user. Callers close it when done. */
export function connectSocket() {
  const token = getToken();
  if (!token) return null;
  return io(URL, { auth: { token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 5000 });
}
