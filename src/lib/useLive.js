import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

const RETRY_STATES = ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"];
const CONNECT_TIMEOUT = 6000;

/**
 * Bir tabloyu canlı takip eder. WebSocket kurulabiliyorsa anlık,
 * kurulamıyorsa yoklama moduna geçer — kurumsal güvenlik duvarları
 * wss trafiğini sıkça engelliyor.
 *
 * @returns {boolean} canlı bağlantı kurulu mu
 */
export function useLive(table, onChange, pollMs = 4000) {
  const [live, setLive] = useState(false);

  // onChange her render'da yeni bir referans olur; bağımlılığa
  // koyarsak abonelik sürekli kurulup yıkılır
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    let poll = null;
    let subscribed = false;
    let cancelled = false;

    const startPolling = () => {
      if (poll || cancelled) return;
      poll = setInterval(() => callback.current(null), pollMs);
    };

    const stopPolling = () => {
      if (!poll) return;
      clearInterval(poll);
      poll = null;
    };

    // Kanal adı her bağlanışta benzersiz: React geliştirme modunda
    // bileşenler iki kez bağlanır ve sabit adlı kanallar çakışır
    const channel = supabase
      .channel(`${table}-${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        if (!cancelled) callback.current(payload);
      })
      .subscribe((status) => {
        if (cancelled) return;

        if (status === "SUBSCRIBED") {
          subscribed = true;
          setLive(true);
          stopPolling();
        } else if (RETRY_STATES.includes(status)) {
          subscribed = false;
          setLive(false);
          startPolling();
        }
      });

    // Bazı güvenlik duvarları bağlantıyı reddetmek yerine askıda
    // bırakır; o durumda hiç durum bildirimi gelmez
    const timeout = setTimeout(() => {
      if (!subscribed) startPolling();
    }, CONNECT_TIMEOUT);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      stopPolling();
      supabase.removeChannel(channel);
    };
  }, [table, pollMs]);

  return live;
}
