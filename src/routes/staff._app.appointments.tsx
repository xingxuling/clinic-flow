import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { PageContainer } from "@/components/layout/AppShell";
import {
  EmptyState,
  MdButton,
  MdCard,
  MdChip,
  MdDialog,
  MdFab,
  MdSegmented,
  MdSelect,
  MdTextField,
  SectionHeader,
} from "@/components/m3";
import { APPOINTMENT_STATUS, fmtDate, fmtTime, fmtWeekday, isSameDay } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import type { Appointment } from "@/types/domain";

export const Route = createFileRoute("/staff/_app/appointments")({
  head: () => ({
    meta: [
      { title: "預約中心｜診所行政 Agent" },
      { name: "description", content: "日／週視圖預約管理：新建、確認、改期、取消與空檔查找。" },
    ],
  }),
  component: AppointmentsPage,
});

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AppointmentsPage() {
  const {
    appointments,
    clinic,
    staff,
    patients,
    patientName,
    serviceName,
    staffName,
    setAppointmentStatus,
    rescheduleAppointment,
    createAppointment,
  } = useApp();

  const [view, setView] = useState<"day" | "week">("day");
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [rescheduleFor, setRescheduleFor] = useState<Appointment | null>(null);
  const [slotsOpen, setSlotsOpen] = useState(false);

  const anchor = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + offset * (view === "day" ? 1 : 7));
    return d;
  }, [offset, view]);

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    const start = new Date(anchor);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchor, view]);

  const openSlots = useMemo(() => {
    const day = days[0]!;
    const slots: string[] = [];
    for (let h = 9; h < 19; h++) {
      for (const m of [0, 30]) {
        const s = new Date(day);
        s.setHours(h, m, 0, 0);
        const busy = appointments.some(
          (a) =>
            a.status !== "cancelled" &&
            new Date(a.startAt) <= s &&
            s < new Date(a.endAt),
        );
        if (!busy && s > new Date()) slots.push(s.toISOString());
      }
    }
    return slots.slice(0, 12);
  }, [appointments, days]);

  return (
    <PageContainer
      title="預約中心"
      subtitle="狀態：待確認／已確認／已到診／失約／取消"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <MdSegmented
            value={view}
            onChange={(v) => {
              setView(v);
              setOffset(0);
            }}
            options={[
              { value: "day", label: "日" },
              { value: "week", label: "週" },
            ]}
          />
          <MdButton variant="outlined" size="sm" icon={<Search className="size-4" />} onClick={() => setSlotsOpen(true)}>
            空檔查找
          </MdButton>
          <div className="flex items-center gap-1">
            <MdButton variant="text" size="sm" onClick={() => setOffset(offset - 1)} icon={<ChevronLeft className="size-4" />}>
              上一{view === "day" ? "日" : "週"}
            </MdButton>
            <MdButton variant="text" size="sm" onClick={() => setOffset(0)}>
              今日
            </MdButton>
            <MdButton variant="text" size="sm" onClick={() => setOffset(offset + 1)} icon={<ChevronRight className="size-4" />}>
              下一{view === "day" ? "日" : "週"}
            </MdButton>
          </div>
          <MdButton icon={<CalendarPlus className="size-4" />} onClick={() => setCreateOpen(true)} className="hidden md:inline-flex">
            新建預約
          </MdButton>
        </div>
      }
    >
      <div className={view === "week" ? "grid gap-3 md:grid-cols-7" : "space-y-3"}>
        {days.map((d) => {
          const list = appointments.filter((a) => isSameDay(a.startAt, d));
          return (
            <div key={d.toISOString()}>
              <SectionHeader
                title={`${fmtDate(d.toISOString())} ${fmtWeekday(d.toISOString())}`}
                count={list.length}
              />
              {list.length === 0 ? (
                <EmptyState text="沒有預約" />
              ) : (
                <div className="space-y-2">
                  {list.map((a) => {
                    const s = APPOINTMENT_STATUS[a.status];
                    return (
                      <MdCard key={a.id} className="p-4">
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="w-14 shrink-0">
                            <p className="md-title-m">{fmtTime(a.startAt)}</p>
                            <p className="md-body-s text-on-surface-variant">{fmtTime(a.endAt)}</p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="md-title-m truncate">{patientName(a.patientId)}</p>
                            <p className="md-body-s text-on-surface-variant">
                              {serviceName(a.serviceId)}・{staffName(a.practitionerId)}・{a.room}
                            </p>
                            {a.note && <p className="mt-1 md-body-s text-on-surface-variant">備註：{a.note}</p>}
                            <p className="mt-1 md-body-s text-on-surface-variant">
                              建立者：{a.createdBy.name}
                              {a.createdBy.type === "agent" && "（Agent）"}
                            </p>
                          </div>
                          <MdChip tone={s.tone}>{s.label}</MdChip>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {a.status === "pending" && (
                            <MdButton size="sm" variant="tonal" onClick={() => setAppointmentStatus(a.id, "confirmed")}>
                              確認
                            </MdButton>
                          )}
                          {a.status === "confirmed" && (
                            <>
                              <MdButton size="sm" variant="tonal" onClick={() => setAppointmentStatus(a.id, "arrived")}>
                                已到診
                              </MdButton>
                              <MdButton size="sm" variant="outlined" onClick={() => setAppointmentStatus(a.id, "no_show")}>
                                失約
                              </MdButton>
                            </>
                          )}
                          {a.status !== "cancelled" && a.status !== "arrived" && (
                            <>
                              <MdButton size="sm" variant="text" onClick={() => setRescheduleFor(a)}>
                                改期
                              </MdButton>
                              <MdButton size="sm" variant="text" onClick={() => setAppointmentStatus(a.id, "cancelled")}>
                                取消
                              </MdButton>
                            </>
                          )}
                          {a.status === "no_show" && (
                            <MdButton size="sm" variant="tonal" onClick={() => setAppointmentStatus(a.id, "pending")}>
                              重新安排
                            </MdButton>
                          )}
                        </div>
                      </MdCard>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <MdFab
        icon={<CalendarPlus className="size-6" />}
        label="新建"
        className="fixed bottom-24 right-4 md:hidden"
        onClick={() => setCreateOpen(true)}
      />

      {/* 新建預約 */}
      <MdDialog open={createOpen} onClose={() => setCreateOpen(false)} title="新建預約">
        <form
          id="create-appointment"
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const serviceId = String(f.get("serviceId"));
            const svc = clinic.services.find((s) => s.id === serviceId);
            createAppointment({
              patientId: String(f.get("patientId")),
              practitionerId: String(f.get("practitionerId")),
              serviceId,
              startAt: new Date(String(f.get("startAt"))).toISOString(),
              durationMin: svc?.durationMin ?? 30,
              room: String(f.get("room")),
              note: String(f.get("note")),
            });
            setCreateOpen(false);
          }}
        >
          <MdSelect label="病人" name="patientId">
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.fileNo}）
              </option>
            ))}
          </MdSelect>
          <MdSelect label="醫生／治療師" name="practitionerId">
            {staff
              .filter((s) => s.role === "practitioner")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </MdSelect>
          <MdSelect label="服務" name="serviceId">
            {clinic.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{s.durationMin} 分鐘）
              </option>
            ))}
          </MdSelect>
          <MdTextField label="開始時間" type="datetime-local" name="startAt" defaultValue={toLocalInput(new Date())} />
          <MdTextField label="診室" name="room" defaultValue="1 號診室" />
          <MdTextField label="備註" name="note" placeholder="行政備註（不記錄病歷）" />
        </form>
        <div className="mt-6 flex justify-end gap-2">
          <MdButton variant="text" onClick={() => setCreateOpen(false)}>
            取消
          </MdButton>
          <MdButton type="submit" form="create-appointment">
            建立
          </MdButton>
        </div>
      </MdDialog>

      {/* 改期 */}
      <MdDialog
        open={!!rescheduleFor}
        onClose={() => setRescheduleFor(null)}
        title={`改期：${rescheduleFor ? patientName(rescheduleFor.patientId) : ""}`}
      >
        {rescheduleFor && (
          <form
            id="reschedule"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              rescheduleAppointment(rescheduleFor.id, new Date(String(f.get("startAt"))).toISOString());
              setRescheduleFor(null);
            }}
          >
            <MdTextField
              label="新的開始時間"
              type="datetime-local"
              name="startAt"
              defaultValue={toLocalInput(new Date(rescheduleFor.startAt))}
            />
            <p className="mt-3 md-body-s">改期後狀態會回到「待確認」，並記錄於審計日誌。</p>
          </form>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <MdButton variant="text" onClick={() => setRescheduleFor(null)}>
            取消
          </MdButton>
          <MdButton type="submit" form="reschedule">
            確認改期
          </MdButton>
        </div>
      </MdDialog>

      {/* 空檔查找 */}
      <MdDialog open={slotsOpen} onClose={() => setSlotsOpen(false)} title="空檔查找">
        <p className="mb-3">
          {fmtDate(days[0]!.toISOString())} 仍可安排的 30 分鐘時段：
        </p>
        <div className="flex flex-wrap gap-2">
          {openSlots.length === 0 && <span>當日已無空檔。</span>}
          {openSlots.map((s) => (
            <MdChip key={s} tone="primary">
              {fmtTime(s)}
            </MdChip>
          ))}
        </div>
      </MdDialog>
    </PageContainer>
  );
}
