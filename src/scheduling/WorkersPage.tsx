import { CalendarDays, MapPin, ShieldCheck, UserRound, Wrench } from "lucide-react";
import { useEffect } from "react";

import { PageContainer } from "@/components/layout/StaffShell";
import { EmptyState, MdCard, MdChip, SectionHeader } from "@/components/m3";
import { useApp } from "@/state/app-store";
import { ensureDemoWorkers } from "@/scheduling/demo";
import { schedulingRepository } from "@/scheduling/repository";
import { useSchedulingSnapshot } from "@/scheduling/use-scheduling";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";

function dayLabel(weekday: number): string {
  return ["日", "一", "二", "三", "四", "五", "六"][weekday] ?? String(weekday);
}

export function WorkersPage() {
  const { clinic, staff } = useApp();
  const vertical = useTenantVertical(clinic);
  const snapshot = useSchedulingSnapshot(clinic.id, vertical.id);

  useEffect(() => {
    ensureDemoWorkers({
      repository: schedulingRepository,
      tenantId: clinic.id,
      vertical,
      staff,
      timezone: clinic.timezone,
    });
  }, [clinic.id, clinic.timezone, staff, vertical]);

  const serviceName = (serviceId: string) =>
    vertical.services.find((service) => service.id === serviceId)?.name ?? serviceId;

  return (
    <PageContainer
      title="Worker"
      subtitle={`${vertical.displayName} · 能力、服务区、档期与当前工作`}
    >
      <MdCard className="mb-5 border border-outline-variant bg-surface-container p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="md-label-l text-on-surface">Worker Profile 不包含客户私人联系方式</p>
            <p className="mt-1 md-body-s text-on-surface-variant">
              排程只显示服务区和时间窗口；精确地址按 Job 阶段与用途通过 Privacy Broker 发放。
            </p>
          </div>
        </div>
      </MdCard>
      <SectionHeader title="可参与排程的 Worker" count={snapshot.workers.length} />
      {snapshot.workers.length === 0 ? (
        <EmptyState text="尚未配置 Worker。" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {snapshot.workers.map((worker) => {
            const workerBookings = snapshot.bookings.filter(
              (booking) =>
                booking.workerId === worker.id &&
                booking.status !== "CANCELLED" &&
                booking.status !== "FAILED",
            );
            const workerHolds = snapshot.holds.filter(
              (hold) => hold.workerId === worker.id && hold.status === "ACTIVE",
            );
            return (
              <MdCard key={worker.id} variant="outlined" className="p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
                    <UserRound className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="md-title-m text-on-surface">{worker.displayName}</h2>
                      <MdChip tone={worker.status === "active" ? "primary" : "neutral"}>
                        {worker.status === "active" ? "可排程" : "暂停"}
                      </MdChip>
                    </div>
                    <p className="mt-1 md-body-s text-on-surface-variant">
                      {worker.timezone} · reliability{" "}
                      {worker.reliabilityScore === undefined
                        ? "—"
                        : `${Math.round(worker.reliabilityScore * 100)}%`}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="flex items-center gap-2 md-label-l text-on-surface">
                      <MapPin className="size-4 text-primary" />
                      服务区
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {worker.serviceAreas.map((area) => (
                        <MdChip key={area.areaId} tone="secondary">
                          {area.label}
                        </MdChip>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="flex items-center gap-2 md-label-l text-on-surface">
                      <Wrench className="size-4 text-primary" />
                      能力
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {worker.capabilities
                        .flatMap((capability) => capability.serviceTypeIds)
                        .map((serviceId) => (
                          <MdChip key={serviceId} tone="neutral">
                            {serviceName(serviceId)}
                          </MdChip>
                        ))}
                    </div>
                  </div>
                </div>
                <div className="mt-5">
                  <p className="flex items-center gap-2 md-label-l text-on-surface">
                    <CalendarDays className="size-4 text-primary" />
                    每周可工作档期
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {worker.availability.weeklyRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="rounded-xl bg-surface-container p-2 md-body-s text-on-surface-variant"
                      >
                        周{dayLabel(rule.weekday)} · {rule.startTime}–{rule.endTime}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <MdChip tone="primary">正式工作 {workerBookings.length}</MdChip>
                  <MdChip tone={workerHolds.length > 0 ? "tertiary" : "neutral"}>
                    临时 Hold {workerHolds.length}
                  </MdChip>
                  <MdChip tone="secondary">
                    支持 {worker.supportedUrgencies?.join("、") ?? "一般"}
                  </MdChip>
                </div>
              </MdCard>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
