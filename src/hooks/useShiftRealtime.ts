import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to a postgres_changes channel for the given table and runs
 * the provided callback whenever a relevant event fires.
 *
 * Used by shift kiosk pages so lists refresh live without manual reload.
 *
 * Safety net: in addition to realtime, the callback also runs when the tab
 * regains focus/visibility and on a light periodic poll, so the UI stays fresh
 * even if the realtime socket drops or an event is missed.
 */
export function useShiftRealtime(
  channelName: string,
  table: string,
  onChange: () => void,
  enabled = true,
  filter?: string,
  pollMs = 15000,
) {
  // Keep the latest callback without re-subscribing on every render.
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    const run = () => cbRef.current();

    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        () => run(),
      )
      .subscribe();

    const onFocus = () => run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    const poll = pollMs > 0 ? window.setInterval(run, pollMs) : undefined;

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      if (poll) window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, table, enabled, filter, pollMs]);
}
