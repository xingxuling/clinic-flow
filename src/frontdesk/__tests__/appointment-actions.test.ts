import { describe, expect, it } from "vitest";

import { InMemoryClinicRepository } from "@/data/repository";
import { seedClinics } from "@/data/seed";
import { executeAppointmentInteractiveAction } from "@/frontdesk/appointment-actions";
import { RepositoryAppointmentAdapter } from "@/integrations/appointment-adapter";

const clinic = seedClinics.find((row) => row.id === "clinic_cinghe")!;
const ctx = { clinicId: clinic.id, actorId: "pt_07" };

describe("一键预约动作", () => {
  it("待确认预约可以一键确认", async () => {
    const repo = new InMemoryClinicRepository();
    const adapter = new RepositoryAppointmentAdapter(repo, clinic);
    const receipt = await executeAppointmentInteractiveAction({
      adapter,
      ctx,
      action: { kind: "confirm", appointmentId: "ap_06" },
      policy: { humanApprovalLeadHours: 24 },
    });

    expect(receipt.ok).toBe(true);
    expect(receipt.status).toBe("executed");
    expect(receipt.appointment?.status).toBe("confirmed");
  });

  it("距离预约太近时取消必须转人工", async () => {
    const repo = new InMemoryClinicRepository();
    const adapter = new RepositoryAppointmentAdapter(repo, clinic);
    const appointment = repo.listAppointments(clinic.id).find((row) => row.id === "ap_06")!;
    const now = new Date(new Date(appointment.startAt).getTime() - 2 * 3_600_000);

    const receipt = await executeAppointmentInteractiveAction({
      adapter,
      ctx,
      action: { kind: "cancel", appointmentId: appointment.id },
      policy: { humanApprovalLeadHours: 24 },
      now,
    });

    expect(receipt.ok).toBe(false);
    expect(receipt.status).toBe("needs_human");
    expect(repo.listAppointments(clinic.id).find((row) => row.id === appointment.id)?.status).toBe("pending");
  });

  it("距离预约够远时取消可由适配器直接执行", async () => {
    const repo = new InMemoryClinicRepository();
    const adapter = new RepositoryAppointmentAdapter(repo, clinic);
    const appointment = repo.listAppointments(clinic.id).find((row) => row.id === "ap_06")!;
    const now = new Date(new Date(appointment.startAt).getTime() - 48 * 3_600_000);

    const receipt = await executeAppointmentInteractiveAction({
      adapter,
      ctx,
      action: { kind: "cancel", appointmentId: appointment.id },
      policy: { humanApprovalLeadHours: 24 },
      now,
    });

    expect(receipt.ok).toBe(true);
    expect(receipt.status).toBe("executed");
    expect(repo.listAppointments(clinic.id).find((row) => row.id === appointment.id)?.status).toBe("cancelled");
  });
});
