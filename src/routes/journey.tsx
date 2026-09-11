import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MapPin, MessageCircle, Navigation, Send } from "lucide-react";
import { MdButton, MdCard } from "@/components/m3";
import { readJourney, updateJourney } from "@/journeys/api.server";
import type { JourneyCommand, JourneyView } from "@/journeys/runtime";

export const Route = createFileRoute("/journey")({
  head: () => ({
    meta: [
      { title: "師傅行程與聯絡｜Service Frontdesk" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: JourneyPage,
});
const labels = {
  waiting: "等待師傅出發",
  en_route: "師傅正在前往",
  arrived: "師傅已到達",
  completed: "本次行程已完成",
  cancelled: "行程已取消",
};

function JourneyPage() {
  const [token, setToken] = useState("");
  const [view, setView] = useState<JourneyView | null>(null);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [tick, setTick] = useState(Date.now());
  const watch = useRef<number | null>(null);
  const lease = useRef<string | null>(null);
  const revision = useRef(0);
  const retry = useRef<{ id: string; text: string } | null>(null);
  const openedToken = useRef("");

  const clearWatch = () => {
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    lease.current = null;
  };
  useEffect(() => {
    const openLink = () => {
      const hash = window.location.hash.slice(1);
      const saved = hash || sessionStorage.getItem("journey-access") || "";
      if (saved) {
        if (openedToken.current === saved) return;
        openedToken.current = saved;
        const previous = sessionStorage.getItem("journey-access");
        if (previous && lease.current)
          void updateJourney({
            data: { token: previous, command: { type: "sharing", enabled: false } },
          }).catch(() => {});
        revision.current += 1;
        clearWatch();
        setView(null);
        setText("");
        retry.current = null;
        setError("");
        setOnline(false);
        sessionStorage.setItem("journey-access", saved);
        setToken(saved);
      } else setError("請使用本次預約的專屬行程連結。");
      if (hash) history.replaceState(null, "", window.location.pathname);
    };
    openLink();
    window.addEventListener("hashchange", openLink);
    window.addEventListener("popstate", openLink);
    return () => {
      window.removeEventListener("hashchange", openLink);
      window.removeEventListener("popstate", openLink);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const version = revision.current;
      try {
        const next = await readJourney({ data: { token } });
        if (alive && version === revision.current) {
          setView(next);
          setOnline(true);
          if (!next.sharing) clearWatch();
        }
      } catch {
        if (alive) {
          setOnline(false);
          setError("連線中斷或入口已失效，正在重試；地圖暫停更新。");
        }
      } finally {
        if (alive) timer = setTimeout(poll, 2000);
      }
    };
    void poll();
    const clock = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(clock);
      const wasSharing = Boolean(lease.current);
      clearWatch();
      if (wasSharing)
        void updateJourney({ data: { token, command: { type: "sharing", enabled: false } } }).catch(
          () => {},
        );
    };
  }, [token]);

  async function send(command: JourneyCommand) {
    const version = ++revision.current;
    const result = await updateJourney({ data: { token, command } });
    if (version === revision.current) {
      setView(result.view);
      setOnline(true);
      setError("");
    }
    return result;
  }
  async function action(command: JourneyCommand) {
    setBusy(true);
    try {
      await send(command);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗，請重試。");
    } finally {
      setBusy(false);
    }
  }
  async function toggleSharing() {
    setBusy(true);
    if (view?.sharing) {
      clearWatch();
      // Hide the marker immediately, but preserve the server sharing flag on failure
      // so the worker can retry revocation rather than accidentally re-enable it.
      setView((v) => (v ? { ...v, position: null } : v));
      try {
        await send({ type: "sharing", enabled: false });
      } catch {
        setError("本機定位已停止；關閉共享尚未送達，請重試。舊位置最長顯示 60 秒。");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!navigator.geolocation || !window.isSecureContext) {
      setError("此瀏覽器需要 HTTPS 及定位權限才能共享位置。");
      setBusy(false);
      return;
    }
    try {
      const result = await send({ type: "sharing", enabled: true });
      const currentLease = result.lease;
      lease.current = currentLease;
      let uploading = false;
      const fail = (error: GeolocationPositionError) => {
        if (error.code !== 1) {
          setError("定位暫時逾時，正在等候新位置；過期位置不會繼續顯示。可隨時關閉共享。");
          return;
        }
        clearWatch();
        void send({ type: "sharing", enabled: false })
          .then(() => setError("定位權限被拒絕或定位失敗，共享已停止。請檢查權限後重新開啟。"))
          .catch(() => setError("本機定位已停止，但撤銷尚未送達。請關閉共享重試。"));
      };
      watch.current = navigator.geolocation.watchPosition(
        (position) => {
          if (!currentLease || lease.current !== currentLease || uploading) return;
          uploading = true;
          void send({
            type: "position",
            lease: currentLease,
            position: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              at: position.timestamp,
            },
          })
            .catch(() => {
              clearWatch();
              setOnline(false);
              setError("位置未送達；定位已停止，請關閉共享後重試。");
            })
            .finally(() => {
              uploading = false;
            });
        },
        fail,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    } catch {
      clearWatch();
      setError("無法開啟共享，請重試。");
    } finally {
      setBusy(false);
    }
  }

  const closed = view?.status === "completed" || view?.status === "cancelled";
  const position =
    online &&
    view?.sharing &&
    view.shareUntil > tick &&
    view.position &&
    tick - view.position.at <= 60000
      ? view.position
      : null;
  const map = position
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${Math.max(-180, position.longitude - 0.01)},${Math.max(-90, position.latitude - 0.006)},${Math.min(180, position.longitude + 0.01)},${Math.min(90, position.latitude + 0.006)}&layer=mapnik&marker=${position.latitude},${position.longitude}`
    : null;
  return (
    <main className="min-h-screen bg-surface px-4 py-8 text-on-surface">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center gap-3">
          <Navigation className="size-8 text-primary" />
          <div>
            <p className="md-label-l text-primary">Service Frontdesk</p>
            <h1 className="md-headline-m">師傅行程與聯絡</h1>
          </div>
        </header>
        <p className="md-body-s text-on-surface-variant">
          開發試用 · 僅本單持有專屬連結的雙方可進入
        </p>
        {error && (
          <p role="alert" className="rounded-2xl bg-error-container p-4 text-on-error-container">
            {error}
          </p>
        )}
        {!view && <p role="status">{token ? "正在連接本次行程…" : "尚未開啟行程"}</p>}
        {view && (
          <>
            <MdCard className="space-y-3 p-5">
              <p className="md-label-l">
                {view.side === "worker" ? "師傅端" : "客戶端"} · {view.service}
              </p>
              <h2 className="md-headline-s">{labels[view.status]}</h2>
              <p>
                {view.workerName} · {online ? "已連線 · 約每 2 秒更新" : "連線中斷"}
              </p>
              {view.side === "worker" && !closed && (
                <div className="flex flex-wrap gap-3">
                  {view.status === "waiting" && (
                    <MdButton
                      disabled={busy}
                      onClick={() => void action({ type: "status", status: "en_route" })}
                    >
                      我已出發
                    </MdButton>
                  )}
                  {view.status === "en_route" && (
                    <MdButton
                      disabled={busy}
                      onClick={() => {
                        clearWatch();
                        void action({ type: "status", status: "arrived" });
                      }}
                    >
                      我已到達
                    </MdButton>
                  )}
                  {view.status === "arrived" && (
                    <MdButton
                      disabled={busy}
                      onClick={() => void action({ type: "status", status: "completed" })}
                    >
                      結束本次行程
                    </MdButton>
                  )}
                  <MdButton
                    variant="outlined"
                    disabled={busy}
                    onClick={() => {
                      clearWatch();
                      void action({ type: "status", status: "cancelled" });
                    }}
                  >
                    取消本次行程
                  </MdButton>
                </div>
              )}
            </MdCard>
            <MdCard variant="outlined" className="overflow-hidden">
              <div className="space-y-3 p-5">
                <h2 className="flex items-center gap-2 md-title-l">
                  <MapPin />
                  即時位置
                </h2>
                {view.side === "worker" && !closed && (
                  <>
                    <p className="md-body-s">
                      自願向本單客戶共享目前位置，最長一小時；到達或結束行程後停止。地圖由
                      OpenStreetMap 提供，顯示地圖時座標會交給該服務。
                    </p>
                    <MdButton
                      disabled={busy || view.status !== "en_route"}
                      onClick={() => void toggleSharing()}
                    >
                      {view.sharing ? "關閉位置共享" : "開啟位置共享"}
                    </MdButton>
                    <p className="md-body-s">
                      定位期間請保持此頁開啟。鎖屏或切換應用可能暫停更新。
                    </p>
                  </>
                )}
                <p role="status">
                  {position
                    ? `最近更新 ${new Date(position.at).toLocaleTimeString("zh-HK")} · 精度約 ${Math.round(position.accuracy)} 米`
                    : view.sharing
                      ? "位置暫未更新"
                      : "師傅未開啟位置共享"}
                </p>
              </div>
              {map && (
                <>
                  <iframe
                    title="師傅目前位置地圖"
                    src={map}
                    referrerPolicy="no-referrer"
                    className="h-80 w-full border-0"
                  />
                  {position && (
                    <div className="space-y-2 px-5 pb-5 md-body-s">
                      <p>
                        座標：{position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
                      </p>
                      <p>底圖需要網絡連線；若未顯示，可在外部地圖查看。</p>
                      <a
                        className="text-primary underline"
                        href={`https://www.openstreetmap.org/?mlat=${position.latitude}&mlon=${position.longitude}#map=16/${position.latitude}/${position.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        在 OpenStreetMap 查看位置
                      </a>
                    </div>
                  )}
                </>
              )}
              {!map && (
                <div className="flex h-40 items-center justify-center bg-surface-container text-on-surface-variant">
                  <MapPin className="mr-2" />
                  位置可用時會在此顯示地圖
                </div>
              )}
            </MdCard>
            <MdCard variant="outlined" className="space-y-4 p-5">
              <h2 className="flex items-center gap-2 md-title-l">
                <MessageCircle />
                本單聯絡
              </h2>
              <p className="md-body-s">關閉定位仍可互傳訊息。</p>
              <div
                aria-label="訂單訊息"
                aria-live="polite"
                className="max-h-96 space-y-3 overflow-y-auto"
              >
                {view.messages.length === 0 && (
                  <p className="py-6 text-center text-on-surface-variant">
                    發出第一則訊息，直接聯絡對方。
                  </p>
                )}
                {view.messages.map((message) => (
                  <div
                    key={`${message.from}:${message.id}`}
                    className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl p-3 ${message.from === view.side ? "ml-auto bg-primary-container" : "bg-surface-container"}`}
                  >
                    <p className="md-label-m">
                      {message.from === "worker" ? "師傅" : "客戶"} ·{" "}
                      {new Date(message.at).toLocaleTimeString("zh-HK")}
                    </p>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!text.trim() || busy) return;
                  const pending =
                    retry.current?.text === text.trim()
                      ? retry.current
                      : { id: crypto.randomUUID(), text: text.trim() };
                  retry.current = pending;
                  setBusy(true);
                  try {
                    await send({ type: "message", ...pending });
                    setText("");
                    retry.current = null;
                  } catch {
                    setError("訊息未確認送達，請再按發送重試。");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <input
                  aria-label="聯絡訊息"
                  maxLength={2000}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="輸入訊息…"
                  disabled={closed}
                  className="min-w-0 flex-1 rounded-full border border-outline bg-surface px-4 py-3"
                />
                <MdButton
                  type="submit"
                  disabled={busy || closed || !text.trim()}
                  icon={<Send className="size-4" />}
                >
                  發送
                </MdButton>
              </form>
            </MdCard>
          </>
        )}
      </div>
    </main>
  );
}
