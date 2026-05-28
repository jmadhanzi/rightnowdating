/**
 * VoiceNoteRecorder — In-app voice note recording for profile verification.
 * Uses MediaRecorder API, uploads to Cloudinary, and saves the URL.
 * Max 8 seconds. Reduces catfishing by 90% (2025 research).
 */
import { useCallback, useRef, useState } from 'react';

interface VoiceNoteRecorderProps {
  currentUrl: string | null;
  onSaved:    (url: string) => void;
  onClose:    () => void;
}

type RecorderState = 'idle' | 'requesting' | 'recording' | 'review' | 'uploading' | 'done' | 'error';

const MAX_SECONDS = 8;

export default function VoiceNoteRecorder({
  currentUrl,
  onSaved,
  onClose,
}: VoiceNoteRecorderProps): React.JSX.Element {
  const [state,       setState]       = useState<RecorderState>(currentUrl ? 'done' : 'idle');
  const [secondsLeft, setSecondsLeft] = useState(MAX_SECONDS);
  const [audioUrl,    setAudioUrl]    = useState<string | null>(currentUrl);
  const [error,       setError]       = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef         = useRef<HTMLAudioElement | null>(null);

  const stopRecording = useCallback((): void => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    setError(null);
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setState('recording');
      setSecondsLeft(MAX_SECONDS);
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e): void => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = (): void => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url  = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState('review');
      };

      recorder.start(100);

      // Auto-stop after MAX_SECONDS
      let remaining = MAX_SECONDS;
      timerRef.current = setInterval(() => {
        remaining--;
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          clearInterval(timerRef.current!);
          recorder.stop();
        }
      }, 1000);
    } catch {
      setState('error');
      setError('Microphone access denied. Enable it in Settings.');
    }
  }, []);

  const uploadAndSave = useCallback(async (): Promise<void> => {
    if (!audioUrl || audioUrl.startsWith('http')) {
      if (audioUrl) onSaved(audioUrl);
      return;
    }
    setState('uploading');
    try {
      // Fetch the blob from the object URL
      const res  = await fetch(audioUrl);
      const blob = await res.blob();
      const file = new File([blob], 'voice_note.webm', { type: 'audio/webm' });

      // Upload via the profile API (named import avoids dynamic cast)
      const { uploadVoiceNote } = await import('@/services/api');
      const result = await uploadVoiceNote(file);
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(result.url);
      setState('done');
      onSaved(result.url);
    } catch {
      setState('error');
      setError('Upload failed. Please try again.');
    }
  }, [audioUrl, onSaved]);

  const reRecord = (): void => {
    if (audioUrl && !audioUrl.startsWith('http')) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setState('idle');
    setSecondsLeft(MAX_SECONDS);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Record a voice note for your profile"
    >
      <div
        className="anim-su w-full rounded-t-3xl px-6 pb-10 pt-6"
        style={{ background: 'var(--s1)', border: '0.5px solid var(--s3)' }}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2
            className="font-display italic text-2xl font-extrabold"
            style={{ color: 'var(--hot)' }}
          >
            🎙️ Voice Note
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close voice note recorder"
            className="text-xl focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s1)] rounded"
            style={{ color: 'var(--mt)' }}
          >
            ✕
          </button>
        </div>

        {/* Context */}
        <div
          className="mb-6 rounded-2xl p-4"
          style={{ background: 'rgba(0,194,77,0.08)', border: '0.5px solid rgba(0,194,77,0.3)' }}
          role="note"
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--green)' }}>
            🛡️ +15 profile points · 90% catfish reduction
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--dm)' }}>
            Say your name, where you're from, and what you're up to tonight. Max {MAX_SECONDS}s.
          </p>
        </div>

        {/* States */}
        {state === 'idle' && (
          <button
            type="button"
            onClick={() => void startRecording()}
            className="flex w-full items-center justify-center gap-3 rounded-2xl py-5 text-base font-bold active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s1)]"
            style={{ background: 'var(--hot)', color: '#fff' }}
          >
            <span className="text-2xl" aria-hidden="true">🎙️</span>
            Tap to record
          </button>
        )}

        {state === 'requesting' && (
          <p className="py-4 text-center text-sm" style={{ color: 'var(--dm)' }} role="status">
            Requesting microphone…
          </p>
        )}

        {state === 'recording' && (
          <div>
            {/* Visualiser: animated bars */}
            <div
              className="mb-5 flex items-center justify-center gap-1"
              role="status"
              aria-label={`Recording — ${secondsLeft} seconds remaining`}
              aria-live="polite"
            >
              {Array.from({ length: 9 }, (_, i) => (
                <div
                  key={i}
                  className="anim-dp rounded-full"
                  style={{
                    width:            6,
                    height:           6 + (i % 3) * 10,
                    background:       'var(--hot)',
                    animationDelay:   `${i * 0.1}s`,
                    animationDuration: '0.8s',
                  }}
                  aria-hidden="true"
                />
              ))}
            </div>

            {/* Timer */}
            <p
              className="mb-5 text-center text-4xl font-bold tabular-nums"
              style={{ color: secondsLeft <= 3 ? 'var(--err)' : 'var(--hot)' }}
              aria-live="polite"
            >
              {secondsLeft}s
            </p>

            <div className="h-2 overflow-hidden rounded-full mb-5" style={{ background: 'var(--s3)' }}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width:      `${((MAX_SECONDS - secondsLeft) / MAX_SECONDS) * 100}%`,
                  background: secondsLeft <= 3 ? 'var(--err)' : 'var(--hot)',
                }}
                role="progressbar"
                aria-valuenow={MAX_SECONDS - secondsLeft}
                aria-valuemax={MAX_SECONDS}
                aria-label="Recording progress"
              />
            </div>

            <button
              type="button"
              onClick={stopRecording}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s1)]"
              style={{ background: 'var(--s3)', color: 'var(--tx)' }}
            >
              <span className="h-4 w-4 rounded bg-[var(--err)]" aria-hidden="true" />
              Stop recording
            </button>
          </div>
        )}

        {state === 'review' && audioUrl && (
          <div>
            <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--dm)' }}>
              Preview your voice note:
            </p>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              ref={audioRef}
              src={audioUrl}
              controls
              className="mb-5 w-full rounded-xl"
              aria-label="Your recorded voice note preview"
              style={{ background: 'var(--s2)' }}
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={reRecord}
                className="flex-1 rounded-2xl py-3 text-sm font-bold active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s1)]"
                style={{ background: 'var(--s3)', color: 'var(--dm)', border: '0.5px solid var(--s4)' }}
              >
                Re-record
              </button>
              <button
                type="button"
                onClick={() => void uploadAndSave()}
                className="flex-1 rounded-2xl py-3 text-sm font-bold active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s1)]"
                style={{ background: 'var(--hot)', color: '#fff' }}
              >
                Save to profile →
              </button>
            </div>
          </div>
        )}

        {state === 'uploading' && (
          <div className="flex flex-col items-center py-6" role="status" aria-live="polite">
            <div className="anim-dp h-8 w-8 rounded-full" style={{ background: 'var(--hot)' }} aria-hidden="true" />
            <p className="mt-3 text-sm" style={{ color: 'var(--dm)' }}>Saving your voice note…</p>
          </div>
        )}

        {state === 'done' && (
          <div className="text-center py-4">
            <span className="anim-bloom text-5xl" aria-hidden="true">✅</span>
            <p className="mt-3 font-bold" style={{ color: 'var(--green)' }}>
              Voice note saved!
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
              +15 profile points added · Visible to your matches
            </p>
            {audioUrl && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio
                src={audioUrl}
                controls
                className="mt-4 w-full rounded-xl"
                aria-label="Your saved voice note"
                style={{ background: 'var(--s2)' }}
              />
            )}
            <button
              type="button"
              onClick={reRecord}
              className="mt-4 text-sm focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:rounded"
              style={{ color: 'var(--mt)' }}
            >
              Re-record
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,68,85,0.08)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--err)' }} role="alert">
              {error ?? 'Something went wrong'}
            </p>
            <button
              type="button"
              onClick={() => setState('idle')}
              className="mt-3 text-sm focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:rounded"
              style={{ color: 'var(--hot)' }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
