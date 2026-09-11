import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MdButton, MdCard } from "@/components/m3";
import { provisionJourney } from "@/journeys/api.server";
import type { ScheduledBooking } from "@/scheduling/types";

export function JourneyLaunch({
  booking,
  workerName,
  service,
}: {
  booking: ScheduledBooking;
  workerName: string;
  service: string;
}) {
  const [links, setLinks] = useState<{ customer: string; worker: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const storageKey = `journey-links:${JSON.stringify([booking.tenantId, booking.verticalId, booking.jobId])}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (
        saved?.expiresAt > Date.now() &&
        typeof saved.customer === "string" &&
        typeof saved.worker === "string"
      )
        setLinks(saved);
    } catch {
      /* Storage is optional; never prevent opening the booking. */
    }
  }, [storageKey]);
  return (
    <MdCard variant="outlined" className="space-y-3 p-4">
      <h3 className="md-title-m">師傅行程 · {workerName}</h3>
      <p className="md-body-s">
        {service} · {new Date(booking.startAt).toLocaleString("zh-HK")}
      </p>
      <p className="md-body-s text-on-surface-variant">
        開啟訂單專屬入口，查看行程及互傳訊息。開發試用：入口有效四小時，伺服器重啟後失效。
      </p>
      {links ? (
        <div className="flex flex-wrap gap-3">
          <Link
            to="/journey"
            hash={links.customer}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-primary px-4 py-3 text-on-primary"
          >
            客戶入口
          </Link>
          <Link
            to="/journey"
            hash={links.worker}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-secondary-container px-4 py-3 text-on-secondary-container"
          >
            師傅入口
          </Link>
        </div>
      ) : (
        <MdButton
          disabled={busy || !import.meta.env.DEV}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const state = booking.state;
              if (
                state !== "SCHEDULED" &&
                state !== "CUSTOMER_CONFIRMED" &&
                state !== "WORKER_NOTIFIED" &&
                state !== "IN_PROGRESS"
              )
                throw new Error("BOOKING_NOT_ACTIVE");
              const created = await provisionJourney({
                data: { booking: { ...booking, state }, workerName, service },
              });
              setLinks(created);
              try {
                sessionStorage.setItem(
                  storageKey,
                  JSON.stringify({ ...created, expiresAt: Date.now() + 4 * 60 * 60_000 }),
                );
              } catch {
                /* Links remain usable for this mounted view. */
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : "無法建立入口");
            } finally {
              setBusy(false);
            }
          }}
        >
          建立行程與聯絡入口
        </MdButton>
      )}
      {!import.meta.env.DEV && <p>正式行程服務尚未啟用。</p>}
      {error && <p role="alert">{error}</p>}
    </MdCard>
  );
}
