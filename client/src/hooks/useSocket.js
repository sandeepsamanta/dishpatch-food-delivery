import { useEffect, useRef } from 'react';
import { connectSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';

/**
 * Subscribes to server-pushed events for as long as the component is mounted.
 * `handlers` is { eventName: fn }. The latest handlers are always used, without reconnecting.
 */
export function useSocketEvents(handlers) {
  const { user } = useAuth();
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!user) return;
    const socket = connectSocket();
    if (!socket) return;
    for (const event of Object.keys(latest.current)) {
      socket.on(event, (payload) => latest.current[event]?.(payload));
    }
    return () => socket.close();
  }, [user]);
}
