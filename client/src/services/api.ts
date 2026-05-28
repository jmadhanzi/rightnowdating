import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { Vibe } from '@rightnow/shared';
import { useAuthStore } from '@/store/useAuthStore';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api: AxiosInstance = axios.create({ baseURL, withCredentials: true });

// --- Request: attach bearer token --------------------------------------------
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// --- Response: refresh once on 401, logout on a second 401 -------------------
type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    if (status === 401 && original) {
      if (original._retry) {
        await useAuthStore.getState().logout();
        return Promise.reject(error);
      }
      original._retry = true;
      try {
        const newToken = await useAuthStore.getState().refreshToken();
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        await useAuthStore.getState().logout();
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  },
);

// =============================================================================
// Typed endpoint functions
// =============================================================================

// --- Auth ---
export interface RequestOtpResponse {
  success: boolean;
  expiresIn: number;
}
export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
  userId: string;
}

export async function requestOtp(phone: string): Promise<RequestOtpResponse> {
  const { data } = await api.post<RequestOtpResponse>('/auth/request-otp', { phone });
  return data;
}

export async function verifyOtp(phone: string, otp: string): Promise<VerifyOtpResponse> {
  const { data } = await api.post<VerifyOtpResponse>('/auth/verify-otp', { phone, otp });
  return data;
}

/** Raw refresh (no interceptor) to avoid recursion. */
export async function refresh(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
    `${baseURL}/auth/refresh`,
    { refreshToken },
  );
  return data;
}

export async function logout(refreshToken: string): Promise<void> {
  await axios.post(`${baseURL}/auth/logout`, { refreshToken });
}

// --- Referrals ---
export async function getReferralStats<T = unknown>(): Promise<T> {
  const { data } = await api.get<T>('/referrals/stats');
  return data;
}
export async function trackReferral(referralCode: string): Promise<{ tracked: boolean }> {
  const { data } = await api.post<{ tracked: boolean }>('/referrals/track', { referralCode });
  return data;
}

// --- Payments ---
export type BillingPeriod = 'monthly' | 'annual';

export async function createSubscription(
  plan: 'plus' | 'vip',
  period: BillingPeriod,
): Promise<{ clientSecret: string | null; customerId: string }> {
  const { data } = await api.post('/payments/create-subscription', { plan, period });
  return data;
}
export async function confirmSubscription(
  paymentMethodId: string,
  plan: 'plus' | 'vip',
  period: BillingPeriod,
): Promise<{ planActive: boolean }> {
  const { data } = await api.post('/payments/confirm-subscription', {
    paymentMethodId,
    plan,
    period,
  });
  return data;
}
export async function createBoost(sessionId: string): Promise<{ clientSecret: string | null }> {
  const { data } = await api.post('/boost/purchase', { sessionId });
  return data;
}
export async function confirmBoost(
  paymentIntentId: string,
  sessionId: string,
): Promise<{ success: boolean; boostEndsAt: string }> {
  const { data } = await api.post('/boost/confirm', { paymentIntentId, sessionId });
  return data;
}
export async function getBoostStatus(): Promise<{
  hasCreditAvailable: boolean;
  credits: number;
  activeBoost: { endsAt: string } | null;
}> {
  const { data } = await api.get('/boost/status');
  return data;
}
export async function cancelSubscription(): Promise<{ success: boolean; endsAt: string | null }> {
  const { data } = await api.post('/payments/cancel', {});
  return data;
}

// --- Sparks / live / boost ---
export async function getWhoViewed<T = unknown>(): Promise<T> {
  const { data } = await api.get<T>('/sparks/who-viewed');
  return data;
}
export interface CreateLivePayload {
  vibe: Vibe;
  windowMinutes: 30 | 60 | 120;
  latitude: number;
  longitude: number;
  radiusMiles?: number;
}
export async function createLive(
  payload: CreateLivePayload,
): Promise<{ sessionId: string; fuzzyLat: number; fuzzyLng: number; expiresAt: string }> {
  const { data } = await api.post('/live/create', payload);
  return data;
}
export async function useBoostCredit(
  sessionId: string,
): Promise<{ success: boolean; boostEndsAt: string; creditsRemaining: number }> {
  const { data } = await api.post('/boost/use-credit', { sessionId });
  return data;
}
export async function setInvisible(enabled: boolean): Promise<{ invisible: boolean }> {
  const { data } = await api.post('/live/invisible-mode', { enabled });
  return data;
}

// --- Safety ---
export async function triggerSos(
  matchId: string,
  latitude: number,
  longitude: number,
): Promise<{ contacted: string[]; success: boolean }> {
  const { data } = await api.post('/safety/sos', { matchId, latitude, longitude });
  return data;
}
export interface TrustedContactInput {
  name: string;
  phone: string;
  isPrimary?: boolean;
}
export async function setTrustedContacts(
  contacts: TrustedContactInput[],
): Promise<{ success: boolean }> {
  const { data } = await api.post('/safety/trusted-contacts', { contacts });
  return data;
}
export async function reportUser(payload: {
  reportedUserId: string;
  matchId?: string;
  reason: string;
  description?: string;
}): Promise<{ success: boolean; reportId: string }> {
  const { data } = await api.post('/safety/report', payload);
  return data;
}

// --- Verification ---
export async function startIdVerification(): Promise<{
  clientSecret: string | null;
  url: string | null;
}> {
  const { data } = await api.post('/verify/id', {});
  return data;
}
export async function verifyPhotoMatch(selfie: string): Promise<{ matched: boolean }> {
  const { data } = await api.post('/verify/photo-match', { selfie });
  return data;
}

// --- Profile ---
export interface UpdateProfilePayload {
  displayName?: string;
  age?: number;
  avatar_emoji?: string;
  bio?: string;
  vibe?: Vibe;
  vibes?: Vibe[];
  city?: string;
  preferred_radius_miles?: number;
  preferred_age_min?: number;
  preferred_age_max?: number;
}
export async function updateProfile<T = unknown>(payload: UpdateProfilePayload): Promise<T> {
  const { data } = await api.patch<T>('/profile', payload);
  return data;
}
export async function getProfile<T = unknown>(): Promise<T> {
  const { data } = await api.get<T>('/profile');
  return data;
}

// --- Notifications ---
export async function subscribePush(
  subscription: PushSubscriptionJSON,
): Promise<{ success: boolean }> {
  const { data } = await api.post('/notifications/subscribe', { subscription });
  return data;
}

// --- Matches & AI ---
export interface MatchVenue {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  isSafeZone: boolean;
}
export interface MatchData {
  matchId: string;
  status: string;
  sparkId: string | null;
  createdAt: string;
  meetupTime: string | null;
  expiresAt: string;
  distanceMiles: number;
  other: {
    userId: string;
    displayName: string;
    age: number | null;
    emoji: string;
    vibe: Vibe;
    trustScore: number;
    verified: boolean;
    interests: string[];
  };
  venue: MatchVenue | null;
}
export async function getMatch(matchId: string): Promise<MatchData> {
  const { data } = await api.get<MatchData>(`/matches/${matchId}`);
  return data;
}
export async function getIcebreaker(matchId: string): Promise<{ icebreaker: string }> {
  const { data } = await api.get('/ai/icebreaker', { params: { matchId } });
  return data;
}

export async function getThreeIcebreakers(matchId: string): Promise<{ icebreakers: string[] }> {
  const { data } = await api.get('/ai/icebreakers/three', { params: { matchId } });
  return data;
}
export async function scoreBio(bio: string): Promise<{ score: number; suggestion: string }> {
  const { data } = await api.post('/ai/profile-score', { bio });
  return data;
}

// --- Chats ---
export interface Conversation {
  matchId: string;
  status: string;
  isActive: boolean;
  meetupTime: string | null;
  partner: { userId: string; displayName: string; emoji: string; trustScore: number };
  lastMessage: { content: string; createdAt: string } | null;
}
export interface ChatMessage {
  id: string;
  matchId: string;
  senderId: string;
  content: string;
  isFlagged: boolean;
  createdAt: string;
}
export async function getChats(): Promise<{ conversations: Conversation[] }> {
  const { data } = await api.get('/chats');
  return data;
}
export async function getChatMessages(matchId: string): Promise<{ messages: ChatMessage[] }> {
  const { data } = await api.get(`/chats/${matchId}/messages`);
  return data;
}

// --- Paywall extras ---
export async function getViewedCount(): Promise<{ count: number }> {
  const { data } = await api.get('/sparks/viewed-count');
  return data;
}
export async function restorePurchases(): Promise<{ plan: string; status: string }> {
  const { data } = await api.get('/payments/restore');
  return data;
}

// --- Wingman Vouching ---
export interface WingmanVouch {
  id: string;
  voucherName: string;
  tags: string[];
  endorsement: string | null;
  createdAt: string;
}

export interface WingmanLinkResponse {
  link: string;
  token: string;
  profile: { displayName: string; avatarEmoji: string; city: string };
}

export interface WingmanPreview {
  userId: string;
  displayName: string;
  avatarEmoji: string;
  city: string;
  existingVouchCount: number;
}

export async function getWingmanLink(): Promise<WingmanLinkResponse> {
  const { data } = await api.get('/wingman/link');
  return data;
}

export async function getWingmanPreview(token: string): Promise<WingmanPreview> {
  const { data } = await api.get(`/wingman/preview/${token}`);
  return data;
}

export async function getWingmanTags(): Promise<{ tags: string[] }> {
  const { data } = await api.get('/wingman/tags');
  return data;
}

export async function submitWingmanVouch(payload: {
  token: string;
  voucherName: string;
  tags: string[];
  endorsement?: string;
}): Promise<{ id: string }> {
  const { data } = await api.post('/wingman/vouch', payload);
  return data;
}

export async function getMyVouches(): Promise<{ vouches: WingmanVouch[] }> {
  const { data } = await api.get('/wingman/vouches');
  return data;
}

export async function deleteMyVouch(vouchId: string): Promise<void> {
  await api.delete(`/wingman/vouches/${vouchId}`);
}

// --- Duo Mode & Open Nights ---

export type OpennessLevel = 'solo' | 'duo_friendly' | 'group' | 'open_night';

export interface DuoPartner {
  id: string;
  displayName: string;
  age: number;
  avatarEmoji: string;
  trustScore: number;
}

export interface DuoProfile {
  duoId: string;
  status: 'pending' | 'active' | 'ended';
  partner: DuoPartner;
  createdAt: string;
}

export interface OpenNight {
  id: string;
  hostUserId: string;
  hostDisplayName: string;
  hostAvatarEmoji: string;
  duoId: string | null;
  partnerDisplayName: string | null;
  venueName: string;
  headline: string;
  vibe: string;
  capacity: number;
  spotsTaken: number;
  spotsLeft: number;
  latitude: number | null;
  longitude: number | null;
  expiresAt: string;
  createdAt: string;
}

export async function getMyDuo(): Promise<DuoProfile | null> {
  const { data } = await api.get('/duo/me');
  return data;
}

export async function searchUsersForDuo(q: string): Promise<{
  users: Array<{ id: string; displayName: string; age: number; avatarEmoji: string }>;
}> {
  const { data } = await api.get('/duo/search', { params: { q } });
  return data;
}

export async function inviteDuo(partnerId: string): Promise<{ duoId: string }> {
  const { data } = await api.post('/duo/invite', { partnerId });
  return data;
}

export async function acceptDuo(duoId: string): Promise<void> {
  await api.post('/duo/accept', { duoId });
}

export async function endDuo(duoId: string): Promise<void> {
  await api.post('/duo/end', { duoId });
}

export async function getNearbyOpenNights(lat: number, lng: number): Promise<{ nights: OpenNight[] }> {
  const { data } = await api.get('/open-nights/nearby', { params: { lat, lng } });
  return data;
}

export async function createOpenNight(payload: {
  duoId?: string;
  venueName: string;
  headline: string;
  vibe: string;
  capacity: number;
  latitude?: number;
  longitude?: number;
  durationMinutes?: number;
}): Promise<{ openNightId: string }> {
  const { data } = await api.post('/open-nights', payload);
  return data;
}

export async function requestJoinOpenNight(payload: {
  openNightId: string;
  duoId?: string;
  message?: string;
}): Promise<{ requestId: string }> {
  const { data } = await api.post('/open-nights/request', payload);
  return data;
}

export async function respondToOpenNightRequest(requestId: string, accept: boolean): Promise<void> {
  await api.post('/open-nights/respond', { requestId, accept });
}
