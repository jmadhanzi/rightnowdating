import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { ToastProvider } from '@/components/Toast';
import ErrorBoundary from '@/components/ErrorBoundary';
import Splash from '@/components/Splash';
import { useAuthStore } from '@/store/useAuthStore';
import { connectSocket, disconnectSocket } from '@/services/socket';

const OnboardingScreen = lazy(() => import('@/screens/OnboardingScreen'));
const GoLiveScreen = lazy(() => import('@/screens/GoLiveScreen'));
const MapScreen = lazy(() => import('@/screens/MapScreen'));
const MatchScreen = lazy(() => import('@/screens/MatchScreen'));
const MeetupScreen = lazy(() => import('@/screens/MeetupScreen'));
const ProfileScreen = lazy(() => import('@/screens/ProfileScreen'));
const ChatsScreen = lazy(() => import('@/screens/ChatsScreen'));
const ChatScreen = lazy(() => import('@/screens/ChatScreen'));
const ReferralScreen = lazy(() => import('@/screens/ReferralScreen'));
const PaywallScreen = lazy(() => import('@/screens/PaywallScreen'));
const WingmanScreen = lazy(() => import('@/screens/WingmanScreen'));
const DuoScreen = lazy(() => import('@/screens/DuoScreen'));
const WrappedScreen = lazy(() => import('@/screens/WrappedScreen'));
const GroupChatScreen = lazy(() => import('@/screens/GroupChatScreen'));

function ProtectedRoute(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Outlet /> : <Navigate to="/onboarding" replace />;
}

function RootRedirect(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return <Navigate to={isAuthenticated ? '/live' : '/onboarding'} replace />;
}

/** Connect the socket while authenticated; disconnect on logout. */
function SocketManager(): null {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  useEffect(() => {
    if (isAuthenticated) connectSocket();
    else disconnectSocket();
  }, [isAuthenticated]);
  return null;
}

export default function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <SocketManager />
          <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/onboarding" element={<OnboardingScreen />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/live" element={<GoLiveScreen />} />
                <Route path="/map" element={<MapScreen />} />
                <Route path="/match/:matchId" element={<MatchScreen />} />
                <Route path="/meetup/:matchId" element={<MeetupScreen />} />
                <Route path="/profile" element={<ProfileScreen />} />
                <Route path="/chats" element={<ChatsScreen />} />
                <Route path="/chat/:matchId" element={<ChatScreen />} />
                <Route path="/referral" element={<ReferralScreen />} />
                <Route path="/upgrade" element={<PaywallScreen />} />
                <Route path="/wingman" element={<WingmanScreen />} />
                <Route path="/duo" element={<DuoScreen />} />
                <Route path="/wrapped" element={<WrappedScreen />} />
                <Route path="/group/:matchId" element={<GroupChatScreen />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
