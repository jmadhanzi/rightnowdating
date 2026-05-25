import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { connectSocket, disconnectSocket, getSocket, type RightnowSocket } from '@/services/socket';

/**
 * Connect the singleton socket while authenticated; disconnect on logout.
 * Returns the socket instance for components that need to emit directly.
 */
export function useSocket(): RightnowSocket {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) connectSocket();
    else disconnectSocket();
  }, [isAuthenticated]);

  return getSocket();
}
