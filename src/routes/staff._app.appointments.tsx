import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { PageContainer } from "@/components/layout/StaffShell";
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
import { useServiceCustomers } from "@/customers/use-service-customers";
import { fmtDate, fmtTime, fmtWeekday, isSameDay } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import type { Appointment } from "@/types/domain";
import { arrivalActionLabel, bookingStatusFor } from "@/verticals/presentation";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";

export const Route = createFileRoute("/staff/_app/appointments")({
  head: () => ({
    meta: [
      { title: "排程中心｜Service Frontdesk" },
      { name: "description", content: "通用服務業排程：新建、確認、改期、取消與空檔查找。" },
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
    staffName,
    setAppointmentStatus,
    rescheduleAppointment,
    createAppointment,
  } = useApp();
  const vertical = useTenantVertical(clinic);
  const { customers, customerName } = useServiceCustomers({ clinic, vertical, legacyPatients: patients });

  const [view, setView] = useState<"day" | "week">("day");
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [rescheduleFor, setRescheduleFor] = useState<Appointment | null>(null);
  const [slotsOpen, setSlotsOpen] = useState(false);

  const visibleAppointments = useMemo(
    () =>
      vertical.id === "dental"
        ? appointments
        : appointments.filter((appointment) =>
            vertical.services.some((service) => service.id === appointment.serviceId),
          ),
    [appointments, vertical],
  );

  const assignableStaff = useMemo(() => {
    const practitioners = staff.filter((person) => person.active && person.role === "practitioner");
    return practitioners.length > 0 ? practitioners : staff.filter((person) => person.active);
  }, [staff]);

  const serviceLabel = (serviceId: string) =>
    vertical.services.find((service) => service.id === serviceId)?.name ??
    clinic.services.find((service) => service.id === serviceId)?.name ??
    "既有服務";

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
        const slot = new Date(day);
        slot.setHours(h, m, 0, 0);
        const busy = visibleAppointments.some(
          (appointment) =>
            appointment.status !== "cancelled" &&
            new Date(appointment.startAt) <= slot &&
            slot < new Date(appointment.endAt),
        );
        if (!busy && slot > new Date()) slots.push(slot.toISOString());
      }
    }
    return slots.slice(0, 12);
  }, [visibleAppointments, days]);

  return (
    <PageContainer
      title={`${vertical.labels.booking}中心`}
      subtitle={`${vertical.displayName} · ${vertical.labels.customer} → 服務 → ${vertical.labels.resource}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <MdSegmented
            value={view}
            onChange={(value) => {
              setView(value);
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
            <MdButton variant="text" size="sm" onClick={() => setOffset(0)}>今日</MdButton>
            <MdButton variant="text" size="sm" onClick={() => setOffset(offset + 1)} icon={<ChevronRight className="size-4" />}>
              下一{view === "day" ? "日" : "週"}
            </MdButton>
          </div>
          <MdButton icon={<CalendarPlus className="size-4" />} onClick={() => setCreateOpen(true)} className="hidden md:inline-flex">
            新建{vertical.labels.booking}
          </MdButton>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <MdChip tone="secondary">{vertical.labels.customer}</MdChip>
        <MdChip tone="secondary">{vertical.labels.subject}</MdChip>
        <MdChip tone="primary">{vertical.labels.booking}</MdChip>
        <MdChip tone="neutral">{vertical.labels.resource}</MdChip>
      </div>

      <div className={view === "week" ? "grid gap-3 md:grid-cols-7" : "space-y-3"}>
        {days.map((day) => {
          const list = visibleAppointments.filter((appointment) => isSameDay(appointment.startAt, day));
          return (
            <div key={day.toISOString()}>
              <SectionHeader title={`${fmtDate(day.toISOString())} ${fmtWeekday(day.toISOString())}`} count={list.length} />
              {list.length === 0 ? (
                <EmptyState text={`沒有${vertical.labels.booking}`} />
              ) : (
                <div className="space-y-2">
                  {list.map((appointment) => {
                    const status = bookingStatusFor(vertical, appointment.status);
                    return (
                      <MdCard key={appointment.id} className="p-4">
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="w-14 shrink-0">
                            <p className="md-title-m">{fmtTime(appointment.startAt)}</p>
                            <p className="md-body-s text-on-surface-variant">{fmtTime(appointment.endAt)}</p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="md-title-m truncate">{customerName(appointment.patientId)}</p>
                            <p className="md-body-s text-on-surface-variant">
                              {serviceLabel(appointment.serviceId)} · {staffName(appointment.practitionerId)} · {appointment.room}
                            </p>
                            {appointment.note && <p className="mt-1 md-body-s text-on-surface-variant">備註：{appointment.note}</p>}
                            <p className="mt-1 md-body-s text-on-surface-variant">
                              建立者：{appointment.createdBy.name}{appointment.createdBy.type === "agent" && "（Agent）"}
                            </p>
                          </div>
                          <MdChip tone={status.tone}>{status.label}</MdChip>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {appointment.status === "pending" && (
                            <MdButton size="sm" variant="tonal" onClick={() => setAppointmentStatus(appointment.id, "confirmed")}>確認</MdButton>
                          )}
                          {appointment.status === "confirmed" && (
                            <>
                              <MdButton size="sm" variant="tonal" onClick={() => setAppointmentStatus(appointment.id, "arrived")}>
                                {arrivalActionLabel(vertical)}
                              </MdButton>
                              <MdButton size="sm" variant="outlined" onClick={() => setAppointmentStatus(appointment.id, "no_show")}>
                                未出現
                              </MdButton>
                            </>
                          )}
                          {appointment.status !== "cancelled" && appointment.status !== "arrived" && (
                            <>
                              <MdButton size="sm" variant="text" onClick={() => setRescheduleFor(appointment)}>改期</MdButton>
                              <MdButton size="sm" variant="text" onClick={() => setAppointmentStatus(appointment.id, "cancelled")}>取消</MdButton>
                            </>
                          )}
                          {appointment.status === "no_show" && (
                            <MdButton size="sm" variant="tonal" onClick={() => setAppointmentStatus(appointment.id, "pending")}>重新安排</MdButton>
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

      <MdDialog open={createOpen} onClose={() => setCreateOpen(false)} title={`新建${vertical.labels.booking}`}>
        <form
          id="create-appointment"
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const serviceId = String(form.get("serviceId"));
            const service = vertical.services.find((item) => item.id === serviceId);
            createAppointment({
              patientId: String(form.get("patientId")),
              practitionerId: String(form.get("practitionerId")),
              serviceId,
              startAt: new Date(String(form.get("startAt"))).toISOString(),
              durationMin: service?.durationMin ?? 60,
              room: String(form.get("room")),
              note: String(form.get("note")),
            });
            setCreateOpen(false);
          }}
        >
          <MdSelect label={vertical.labels.customer} name="patientId">
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.displayName} · {customer.phone}</option>
            ))}
          </MdSelect>
          <MdSelect label={vertical.labels.resource} name="practitionerId">
            {assignableStaff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </MdSelect>
          <MdSelect label="服務" name="serviceId">
            {vertical.services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}{service.durationMin ? `（${service.durationMin} 分鐘）` : ""}
              </option>
            ))}
          </MdSelect>
          <MdTextField label="開始時間" type="datetime-local" name="startAt" defaultValue={toLocalInput(new Date())} />
          <MdTextField label={vertical.labels.venue} name="room" defaultValue={vertical.labels.venue} />
          <MdTextField label="行政備註" name="note" placeholder="只記錄服務安排所需資料" />
        </form>
        <div className="mt-6 flex justify-end gap-2">
          <MdButton variant="text" onClick={() => setCreateOpen(false)}>取消</MdButton>
          <MdButton type="submit" form="create-appointment" disabled={customers.length === 0}>建立</MdButton>
        </div>
      </MdDialog>

      <MdDialog
        open={!!rescheduleFor}
        onClose={() => setRescheduleFor(null)}
        title={`改期：${rescheduleFor ? customerName(rescheduleFor.patientId) : ""}`}
      >
        {rescheduleFor && (
          <form
            id="reschedule"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              rescheduleAppointment(rescheduleFor.id, new Date(String(form.get("startAt"))).toISOString());
              setRescheduleFor(null);
            }}
          >
            <MdTextField
              label="新的開始時間"
              type="datetime-local"
              name="startAt"
              defaultValue={toLocalInput(new Date(rescheduleFor.startAt))}
            />
            <p className="mt-3 md-body-s">改期後狀態回到「待確認」，並保留審計紀錄。</p>
          </form>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <MdButton variant="text" onClick={() => setRescheduleFor(null)}>取消</MdButton>
          <MdButton type="submit" form="reschedule">確認改期</MdButton>
        </div>
      </MdDialog>

      <MdDialog open={slotsOpen} onClose={() => setSlotsOpen(false)} title={`${vertical.labels.booking}空檔`}>
        <p className="mb-3">{fmtDate(days[0]!.toISOString())} 可安排時段：</p>
        <div className="flex flex-wrap gap-2">
          {openSlots.length === 0 && <span>當日已無空檔。</span>}
          {openSlots.map((slot) => <MdChip key={slot} tone="primary">{fmtTime(slot)}</MdChip>)}
        </div>
      </MdDialog>
    </PageContainer>
  );
}
