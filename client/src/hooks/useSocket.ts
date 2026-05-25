import { useEffect } from 'react';
import { getSocket, type RightnowSocket } from '@/services/socket';

/** Connects the singleton socket on mount and disconnects on unmount. */
export function useSocket(): RightnowSocket {
  const socket = getSocket();

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  return socket;
}
