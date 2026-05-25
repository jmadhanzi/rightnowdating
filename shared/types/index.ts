/**
 * Shared types used by both the RIGHTNOW server and client.
 * Keep this framework-agnostic — no runtime dependencies.
 */

// -----------------------------------------------------------------------------
// Geo
// -----------------------------------------------------------------------------
export interface LngLat {
  lng: number;
  lat: number;
}

// -----------------------------------------------------------------------------
// Domain enums
// -----------------------------------------------------------------------------
/** The "vibe" a user broadcasts when going live. */
export type Vibe = 'coffee' | 'drinks' | 'walk' | 'food' | 'late';

/** How long a live session stays active. */
export type TimeWindow = '30m' | '1h' | '2h';

export type SessionStatus = 'live' | 'paused' | 'expired';

export type MatchStatus = 'pending' | 'sparked' | 'matched' | 'expired' | 'cancelled';

export type Gender = 'man' | 'woman' | 'nonbinary' | 'other';

// -----------------------------------------------------------------------------
// User
// -----------------------------------------------------------------------------
export interface User {
  id: string;
  phone: string;
  displayName: string;
  age: number;
  gender: Gender;
  bio: string | null;
  photoUrl: string | null;
  trustScore: number;
  isPlus: boolean;
  createdAt: string;
}

/** Public-safe view of a user shown on the map / in matches. */
export interface PublicUser {
  id: string;
  displayName: string;
  age: number;
  photoUrl: string | null;
  trustScore: number;
}

// -----------------------------------------------------------------------------
// Live session
// -----------------------------------------------------------------------------
export interface LiveSession {
  id: string;
  userId: string;
  vibe: Vibe;
  timeWindow: TimeWindow;
  status: SessionStatus;
  location: LngLat;
  boosted: boolean;
  startedAt: string;
  expiresAt: string;
}

/** A live pin rendered on the map. */
export interface MapPin {
  sessionId: string;
  user: PublicUser;
  vibe: Vibe;
  location: LngLat;
  distanceMeters: number;
  boosted: boolean;
}

// -----------------------------------------------------------------------------
// Matching / chat
// -----------------------------------------------------------------------------
export interface Match {
  id: string;
  status: MatchStatus;
  participants: [string, string];
  createdAt: string;
  expiresAt: string | null;
}

export interface ChatMessage {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// Auth
// -----------------------------------------------------------------------------
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string; // user id
  phone: string;
}

// -----------------------------------------------------------------------------
// API envelope
// -----------------------------------------------------------------------------
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface HealthResponse {
  status: 'ok';
  uptime: number;
  timestamp: string;
}

// -----------------------------------------------------------------------------
// Socket.io event contracts
// -----------------------------------------------------------------------------
export interface ServerToClientEvents {
  'presence:update': (pins: MapPin[]) => void;
  'match:spark': (match: Match) => void;
  'match:confirmed': (match: Match) => void;
  'chat:message': (message: ChatMessage) => void;
  'session:expired': (sessionId: string) => void;
}

export interface ClientToServerEvents {
  'presence:subscribe': (bounds: { ne: LngLat; sw: LngLat }) => void;
  'match:spark': (payload: { targetUserId: string }) => void;
  'chat:message': (payload: { matchId: string; body: string }) => void;
}
