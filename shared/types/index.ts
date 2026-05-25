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
export type Vibe = 'coffee' | 'drinks' | 'walk' | 'food' | 'explore' | 'late' | 'spicy';

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
  userId: string;
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
// Real-time payloads
// -----------------------------------------------------------------------------
export interface GoLivePayload {
  vibe: Vibe;
  windowMinutes: number;
  latitude: number;
  longitude: number;
  radiusMiles: number;
}

/** A live map pin (fuzzy location only — never exact GPS). */
export interface MapPinPayload {
  sessionId: string;
  fuzzyLat: number;
  fuzzyLng: number;
  vibe: Vibe;
  trustScore: number;
}

export interface SparkSenderPreview {
  userId: string;
  displayName: string;
  age: number | null;
  emoji: string;
  trustScore: number;
}

export interface SparkReceivedPayload {
  sparkId: string;
  sender: SparkSenderPreview;
  expiresAt: string;
}

export interface VenueSuggestion {
  id: string | null;
  name: string;
  address: string;
  distanceMeters: number;
  directionsUrl: string;
  isSafeZone: boolean;
}

export interface MatchCreatedPayload {
  matchId: string;
  venue: VenueSuggestion | null;
  meetupTime: string;
  countdown: number; // seconds until meetup
}

export interface MessageReceivedPayload {
  id: string;
  matchId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// Socket.io event contracts
// -----------------------------------------------------------------------------
export interface ServerToClientEvents {
  'map:pin:added': (pin: MapPinPayload) => void;
  'map:pin:removed': (payload: { sessionId: string }) => void;
  'spark:received': (payload: SparkReceivedPayload) => void;
  'spark:expired': (payload: { sparkId: string }) => void;
  'match:created': (payload: MatchCreatedPayload) => void;
  'message:received': (payload: MessageReceivedPayload) => void;
  'message:flagged': (payload: { messageId: string; reason: string }) => void;
  'date:checkin:ping': (payload: { matchId: string }) => void;
  'session:expiring': (payload: { sessionId: string; expiresAt: string }) => void;
  'app:error': (payload: { event: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'go:live': (payload: GoLivePayload) => void;
  'go:offline': () => void;
  'spark:send': (payload: { targetSessionId: string }) => void;
  'spark:accept': (payload: { sparkId: string }) => void;
  'spark:decline': (payload: { sparkId: string }) => void;
  'message:send': (payload: { matchId: string; content: string }) => void;
  'checkin:confirm': (payload: { matchId: string }) => void;
}
