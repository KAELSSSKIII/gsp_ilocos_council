import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Detects user inactivity and returns a warning flag after `idleMinutes`.
 * After the warning, the caller has `warningSeconds` to dismiss before `onLogout` fires.
 *
 * @param idleMinutes    - Minutes of inactivity before warning (default: 30)
 * @param warningSeconds - Seconds of grace period shown to user (default: 60)
 * @param onLogout       - Callback invoked when grace period expires
 */
export function useIdleTimeout(
  idleMinutes = 30,
  warningSeconds = 60,
  onLogout?: () => void,
) {
  const [showWarning, setShowWarning] = useState(false);

  const idleTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLogoutRef     = useRef(onLogout);
  onLogoutRef.current   = onLogout;

  const clearAllTimers = () => {
    if (idleTimerRef.current)   clearTimeout(idleTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
  };

  const resetTimer = useCallback(() => {
    setShowWarning(false);
    clearAllTimers();

    idleTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      logoutTimerRef.current = setTimeout(() => {
        onLogoutRef.current?.();
      }, warningSeconds * 1000);
    }, idleMinutes * 60 * 1000);
  }, [idleMinutes, warningSeconds]);

  useEffect(() => {
    const events = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"] as const;
    const handleActivity = () => {
      if (!showWarning) resetTimer();
    };

    events.forEach((e) => document.addEventListener(e, handleActivity, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((e) => document.removeEventListener(e, handleActivity));
      clearAllTimers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTimer]);

  return { showWarning, resetTimer };
}
