import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import mapboxgl, { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { SparkReceivedPayload } from '@rightnow/shared';

import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import CountdownTimer from '@/components/CountdownTimer';
import BottomNav from '@/components/BottomNav';
import NearbyCardSkeleton from '@/components/skeletons/NearbyCardSkeleton';
import { useToast } from '@/hooks/useToast';
import { useMapStore, type StoredPin } from '@/store/useMapStore';
import { useMatchStore } from '@/store/useMatchStore';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { getSocket, goOffline, sparkAccept, sparkDecline, sparkSend } from '@/services/socket';
import { VIBES } from '@/utils/vibes';
import { haversineMeters, metersToMiles } from '@/utils/geo';
import { formatMMSS } from '@/utils/time';

const MIAMI = { lng: -80.1918, lat: 25.7617 };
const DEFAULT_ZOOM = 14;
const MAX_PINS = 50;
const BATCH_MS = 500;
const NAV_H = 72;
const DRAWER_H = 200;
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

type Overlay =
  | { mode: 'incoming'; spark: SparkReceivedPayload }
  | { mode: 'outgoing'; pin: StoredPin }
  | null;

interface MarkerEntry {
  marker: MapboxMarker;
  isOwn: boolean;
  boosted: boolean;
}

export default function MapScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();

  const nearbyPins = useMapStore((s) => s.nearbyPins);
  const mySession = useMapStore((s) => s.mySession);
  const cityCount = useMapStore((s) => s.cityCount);
  const setCityCount = useMapStore((s) => s.setCityCount);
  const setMySession = useMapStore((s) => s.setMySession);
  const updatePin = useMapStore((s) => s.updatePin);

  const pendingSparks = useMatchStore((s) => s.pendingSparks);
  const removeSpark = useMatchStore((s) => s.removeSpark);
  const activeMatch = useMatchStore((s) => s.activeMatch);

  const plan = useSubscriptionStore((s) => s.plan);

  const [myLocation, setMyLocation] = useState(MIAMI);
  const [mapReady, setMapReady] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sessionMenu, setSessionMenu] = useState(false);
  const [pillPulse, setPillPulse] = useState(false);
  const [liveLeft, setLiveLeft] = useState(0);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPinClickRef = useRef<(sessionId: string) => void>(() => undefined);

  // --- Distance helper + visible (nearest 50) pins --------------------------
  const distanceMiles = useCallback(
    (pin: StoredPin): number =>
      metersToMiles(haversineMeters(myLocation.lat, myLocation.lng, pin.fuzzyLat, pin.fuzzyLng)),
    [myLocation],
  );

  const visiblePins = useMemo(
    () => [...nearbyPins].sort((a, b) => distanceMiles(a) - distanceMiles(b)).slice(0, MAX_PINS),
    [nearbyPins, distanceMiles],
  );

  const drawerPins = useMemo(
    () => visiblePins.filter((p) => p.sessionId !== mySession?.sessionId),
    [visiblePins, mySession],
  );

  const viewCount = useMemo(() => Math.max(1, Math.round(cityCount * 0.3)), [cityCount]);

  // Keep the activity-pill count in sync with what's on the map.
  useEffect(() => {
    setCityCount(nearbyPins.length);
  }, [nearbyPins.length, setCityCount]);

  // Use the device location when available (falls back to Miami).
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setMyLocation({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
      () => undefined,
      { enableHighAccuracy: false, timeout: 5000 },
    );
  }, []);

  // --- Pin click handler (kept in a ref so DOM markers stay current) --------
  const openSparkCard = useCallback((sessionId: string) => {
    const pin = useMapStore.getState().nearbyPins.find((p) => p.sessionId === sessionId);
    if (pin) setOverlay({ mode: 'outgoing', pin });
  }, []);
  useEffect(() => {
    onPinClickRef.current = openSparkCard;
  }, [openSparkCard]);

  // --- Map initialization ---------------------------------------------------
  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new MapboxMap({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [MIAMI.lng, MIAMI.lat],
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    map.on('load', () => {
      try {
        map.setPaintProperty('background', 'background-color', '#0c0c10');
      } catch {
        /* layer may not exist */
      }
      try {
        map.setPaintProperty('water', 'fill-color', '#080810');
      } catch {
        /* noop */
      }
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.id.includes('road') && layer.type === 'line') {
          try {
            map.setPaintProperty(layer.id, 'line-color', 'rgba(255,255,255,0.08)');
          } catch {
            /* noop */
          }
        }
      }
      setMapReady(true);
    });

    mapRef.current = map;

    const markers = markersRef.current;
    return () => {
      markers.forEach((entry) => entry.marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // --- Marker sync (batched over 500ms) -------------------------------------
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    const apply = (): void => {
      const markers = markersRef.current;
      const wanted = new Set(visiblePins.map((p) => p.sessionId));

      for (const [sessionId, entry] of markers) {
        if (!wanted.has(sessionId)) {
          entry.marker.remove();
          markers.delete(sessionId);
        }
      }

      for (const pin of visiblePins) {
        const isOwn = pin.sessionId === mySession?.sessionId;
        const boosted = Boolean(pin.boosted);
        const existing = markers.get(pin.sessionId);
        if (existing && existing.isOwn === isOwn && existing.boosted === boosted) continue;
        existing?.marker.remove();
        const marker = new MapboxMarker({ element: createMarkerEl(pin, isOwn, onPinClickRef) })
          .setLngLat([pin.fuzzyLng, pin.fuzzyLat])
          .addTo(map);
        markers.set(pin.sessionId, { marker, isOwn, boosted });
      }
    };

    if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    batchTimerRef.current = setTimeout(apply, BATCH_MS);
    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  }, [visiblePins, mapReady, mySession]);

  // --- Activity pill micro-animation ----------------------------------------
  useEffect(() => {
    setPillPulse(true);
    const id = setTimeout(() => setPillPulse(false), 300);
    return () => clearTimeout(id);
  }, [cityCount]);

  // --- GO LIVE countdown ----------------------------------------------------
  useEffect(() => {
    if (!mySession) return;
    const tick = (): void =>
      setLiveLeft(Math.max(0, Math.round((Date.parse(mySession.expiresAt) - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mySession]);

  // --- Show overlay for the latest received spark ---------------------------
  useEffect(() => {
    if (overlay) return;
    const latest = pendingSparks[pendingSparks.length - 1];
    if (latest) setOverlay({ mode: 'incoming', spark: latest });
  }, [pendingSparks, overlay]);

  // --- Navigate to the match once created -----------------------------------
  useEffect(() => {
    if (activeMatch) {
      setOverlay(null);
      navigate(`/match/${activeMatch.matchId}`);
    }
  }, [activeMatch, navigate]);

  // --- Periodic stale-pin cleanup (belt-and-suspenders for map:pin:removed) --
  const clearExpired = useMapStore((s) => s.clearExpired);
  useEffect(() => {
    const id = setInterval(clearExpired, 60_000);
    return () => clearInterval(id);
  }, [clearExpired]);

  // --- Component-scoped socket events ---------------------------------------
  useEffect(() => {
    const socket = getSocket();
    const onExpiring = (): void => toast.warning('Your session expires in 5 minutes');
    const onBoost = ({ sessionId }: { sessionId: string }): void =>
      updatePin(sessionId, { boosted: true });
    socket.on('session:expiring', onExpiring);
    socket.on('boost:activated', onBoost);
    return () => {
      socket.off('session:expiring', onExpiring);
      socket.off('boost:activated', onBoost);
    };
  }, [toast, updatePin]);

  // --- Actions --------------------------------------------------------------
  const sendSpark = (pin: StoredPin): void => {
    sparkSend(pin.sessionId);
    toast.success('Spark sent ⚡');
  };

  const handleAccept = (spark: SparkReceivedPayload): void => {
    sparkAccept(spark.sparkId);
    removeSpark(spark.sparkId);
  };

  const handleDecline = (spark: SparkReceivedPayload): void => {
    sparkDecline(spark.sparkId);
    removeSpark(spark.sparkId);
    setOverlay(null);
  };

  const endSession = (): void => {
    goOffline();
    setMySession(null);
    setSessionMenu(false);
    toast.success('Session ended');
  };

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: 'var(--s0)' }}>
      {MAPBOX_TOKEN ? (
        <div ref={mapContainerRef} className="absolute inset-0" />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center text-center text-sm"
          style={{
            color: 'var(--mt)',
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        >
          Map unavailable — set VITE_MAPBOX_TOKEN
        </div>
      )}

      {/* Activity pill */}
      <div className="pointer-events-none absolute left-0 right-0 top-4 z-20 flex justify-center">
        <span
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
          style={{
            background: 'rgba(17,17,17,0.8)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--s4)',
            color: 'var(--tx)',
          }}
        >
          <span className="anim-dp h-2 w-2 rounded-full" style={{ background: 'var(--green)' }} />
          <span
            style={{
              display: 'inline-block',
              transition: 'transform 150ms ease',
              transform: pillPulse ? 'scale(1.25)' : 'scale(1)',
              color: 'var(--hot)',
              fontWeight: 800,
            }}
          >
            {cityCount}
          </span>
          live near you · Miami
        </span>
      </div>

      {/* GO LIVE floating button */}
      <button
        type="button"
        onClick={() => (mySession ? setSessionMenu(true) : navigate('/live'))}
        className="anim-gp absolute right-5 z-30 flex flex-col items-center justify-center rounded-full font-display font-extrabold leading-none active:scale-95"
        style={{
          bottom: NAV_H + DRAWER_H + 16,
          width: 92,
          height: 92,
          background: 'linear-gradient(135deg, var(--hot), #ff7a33)',
          color: '#fff',
        }}
      >
        {mySession ? (
          <>
            <span className="text-sm">LIVE</span>
            <span className="text-xs tabular-nums">{formatMMSS(liveLeft)}</span>
          </>
        ) : (
          <>
            <span className="text-base">GO</span>
            <span className="text-base">LIVE</span>
          </>
        )}
      </button>

      {/* Nearby drawer */}
      <div
        className="absolute left-0 right-0 z-20"
        style={{
          bottom: NAV_H,
          height: DRAWER_H,
          background: 'rgba(17,17,17,0.85)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--s4)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <span className="font-bold uppercase tracking-wide" style={{ color: 'var(--tx)' }}>
            Nearby Now
          </span>
          <span className="text-xs" style={{ color: 'var(--mt)' }}>
            Tap a pin or card to spark
          </span>
        </div>

        <div className="flex gap-3 overflow-x-auto px-5 pb-2" style={{ scrollbarWidth: 'none' }}>
          {!mapReady &&
            drawerPins.length === 0 &&
            [0, 1, 2].map((i) => <NearbyCardSkeleton key={i} />)}
          {mapReady && drawerPins.length === 0 && (
            <p className="py-6 text-sm" style={{ color: 'var(--mt)' }}>
              No one live nearby yet — be the first to go live.
            </p>
          )}
          {drawerPins.map((pin) => (
            <PersonCard
              key={pin.sessionId}
              pin={pin}
              miles={distanceMiles(pin)}
              onOpen={() => setOverlay({ mode: 'outgoing', pin })}
              onSpark={() => sendSpark(pin)}
            />
          ))}
        </div>

        {plan === 'free' && (
          <button
            type="button"
            onClick={() => navigate('/upgrade')}
            className="mx-5 flex w-[calc(100%-40px)] items-center justify-between rounded-xl px-4 py-2 text-xs"
            style={{ background: 'var(--s2)', border: '1px solid var(--s4)', color: 'var(--dm)' }}
          >
            <span>{viewCount} people viewed your pin today</span>
            <span style={{ color: 'var(--hot)' }}>Upgrade to see →</span>
          </button>
        )}
      </div>

      <BottomNav />

      {/* Session menu */}
      {sessionMenu && (
        <div
          className="fixed inset-0 z-40 flex items-end"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSessionMenu(false)}
        >
          <div
            className="anim-su w-full rounded-t-2xl p-5"
            style={{ background: 'var(--s1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 font-bold" style={{ color: 'var(--tx)' }}>
              You&apos;re live
            </p>
            <div className="space-y-2">
              <Button
                fullWidth
                onClick={() => {
                  setSessionMenu(false);
                  navigate('/live');
                }}
              >
                Extend session
              </Button>
              <Button fullWidth variant="danger" onClick={endSession}>
                End session
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Spark card overlay */}
      {overlay && (
        <SparkOverlay
          overlay={overlay}
          milesFor={distanceMiles}
          onSend={(pin) => {
            sendSpark(pin);
            setOverlay(null);
          }}
          onAccept={handleAccept}
          onDecline={handleDecline}
          onClose={() => setOverlay(null)}
          onExpire={(spark) => {
            removeSpark(spark.sparkId);
            setOverlay(null);
            toast.warning('Match expired');
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function createMarkerEl(
  pin: StoredPin,
  isOwn: boolean,
  onClick: React.MutableRefObject<(sessionId: string) => void>,
): HTMLDivElement {
  const color = isOwn ? '#00e55b' : '#ff5c00';
  const size = isOwn ? 16 : 13;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:28px;height:28px;cursor:pointer';

  const ring = document.createElement('div');
  ring.className = 'anim-pring';
  ring.style.cssText = `position:absolute;inset:0;border-radius:9999px;background:${color};opacity:0.5`;
  wrap.appendChild(ring);

  if (pin.boosted) {
    // Boosted pins float, gain a gold ring, and sit above the rest (organic lift).
    wrap.className = 'anim-float';
    wrap.style.zIndex = '10';
    const gold = document.createElement('div');
    gold.style.cssText =
      'position:absolute;inset:-5px;border-radius:9999px;border:2px solid #FFD700';
    wrap.appendChild(gold);
  }

  const dot = document.createElement('div');
  dot.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${size}px;height:${size}px;border-radius:9999px;background:${color};box-shadow:0 0 12px ${color}`;
  wrap.appendChild(dot);

  wrap.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick.current(pin.sessionId);
  });
  return wrap;
}

// ---------------------------------------------------------------------------
const PersonCard = memo(function PersonCard({
  pin,
  miles,
  onOpen,
  onSpark,
}: {
  pin: StoredPin;
  miles: number;
  onOpen: () => void;
  onSpark: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-36 shrink-0 flex-col items-center gap-1 rounded-2xl p-3 text-center active:scale-95"
      style={{ background: 'var(--s2)', border: '1px solid var(--s4)' }}
    >
      <Avatar emoji={pin.emoji ?? '🧑'} size="md" showOnline trustScore={pin.trustScore} />
      <span className="text-sm font-bold" style={{ color: 'var(--tx)' }}>
        {pin.displayName ?? 'Someone'}
        {pin.age ? `, ${pin.age}` : ''}
      </span>
      <span className="text-xs" style={{ color: 'var(--mt)' }}>
        {miles.toFixed(1)} mi away
      </span>
      <span
        className="rounded-full px-2 py-0.5 text-xs"
        style={{ background: 'rgba(255,92,0,0.12)', color: 'var(--hot)' }}
      >
        {VIBES[pin.vibe].emoji} {VIBES[pin.vibe].label}
      </span>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onSpark();
        }}
        className="mt-1 w-full rounded-lg py-1.5 text-xs font-bold uppercase"
        style={{ background: 'linear-gradient(135deg, var(--hot), #ff7a33)', color: '#fff' }}
      >
        Spark
      </span>
    </button>
  );
});

// ---------------------------------------------------------------------------
function SparkOverlay({
  overlay,
  milesFor,
  onSend,
  onAccept,
  onDecline,
  onClose,
  onExpire,
}: {
  overlay: NonNullable<Overlay>;
  milesFor: (pin: StoredPin) => number;
  onSend: (pin: StoredPin) => void;
  onAccept: (spark: SparkReceivedPayload) => void;
  onDecline: (spark: SparkReceivedPayload) => void;
  onClose: () => void;
  onExpire: (spark: SparkReceivedPayload) => void;
}): React.JSX.Element {
  const incoming = overlay.mode === 'incoming';
  const name = incoming ? overlay.spark.sender.displayName : (overlay.pin.displayName ?? 'Someone');
  const age = incoming ? overlay.spark.sender.age : overlay.pin.age;
  const emoji = incoming ? overlay.spark.sender.emoji : (overlay.pin.emoji ?? '🧑');
  const trust = incoming ? overlay.spark.sender.trustScore : overlay.pin.trustScore;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(7px)' }}
      onClick={() => (incoming ? onDecline(overlay.spark) : onClose())}
    >
      <div
        className="anim-su w-full rounded-t-3xl px-6 pb-8 pt-6 text-center"
        style={{ background: 'var(--s1)', border: '1px solid var(--s4)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-4xl">⚡</div>
        <h2
          className="mt-2 font-display italic"
          style={{ fontSize: 26, fontWeight: 800, color: 'var(--hot)' }}
        >
          {incoming ? "It's a Spark!" : 'Send a Spark'}
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
          {incoming
            ? `${name} sparked you — mutual match!`
            : `Spark ${name} to start a 7-minute window`}
        </p>

        <div
          className="mt-5 flex items-center gap-3 rounded-2xl p-3 text-left"
          style={{ background: 'var(--s2)', border: '1px solid var(--s4)' }}
        >
          <Avatar emoji={emoji} size="lg" trustScore={trust} showOnline />
          <div className="flex-1">
            <p className="font-bold" style={{ color: 'var(--tx)' }}>
              {name}
              {age ? `, ${age}` : ''}
            </p>
            <p className="text-xs" style={{ color: 'var(--mt)' }}>
              {incoming
                ? 'Mutual spark · meet now'
                : `${VIBES[overlay.pin.vibe].label} · ${milesFor(overlay.pin).toFixed(1)} mi away`}
            </p>
          </div>
          {trust >= 66 && (
            <span
              className="rounded-full px-2 py-1 text-xs font-bold"
              style={{ background: 'rgba(0,229,91,0.12)', color: 'var(--green)' }}
            >
              ✓ Verified
            </span>
          )}
        </div>

        {incoming && (
          <div className="mt-4 text-2xl">
            <CountdownTimer
              expiresAt={Date.parse(overlay.spark.expiresAt)}
              variant="spark"
              onExpire={() => onExpire(overlay.spark)}
            />
          </div>
        )}

        <div className="mt-6 space-y-2">
          {incoming ? (
            <>
              <Button fullWidth size="lg" onClick={() => onAccept(overlay.spark)}>
                Accept &amp; Meet
              </Button>
              <Button fullWidth variant="ghost" onClick={() => onDecline(overlay.spark)}>
                ✕ Decline
              </Button>
            </>
          ) : (
            <>
              <Button fullWidth size="lg" onClick={() => onSend(overlay.pin)}>
                Send Spark ⚡
              </Button>
              <Button fullWidth variant="ghost" onClick={onClose}>
                Close
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
