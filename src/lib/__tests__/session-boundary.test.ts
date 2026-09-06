import { describe, expect, it } from "vitest";

import { ownAppointments, ownConversations, ownDocuments, ownReminders, availableSlots } from "@/data/patient-view";
import { InMemoryClinicRepository } from "@/data/repository";
import { isPatientSession, isStaffSession, resolvePortalPatientId } from "@/lib/session";
import type { PatientSession, StaffSession } from "@/types/domain";

const staffSession: StaffSession = {
  kind: "staff",
  clinicId: "clinic_cinghe",
  staffId: "staff_reception",
  deviceBound: true,
  method: "code",
  at: new Date().toISOString(),
};

const patientSession: PatientSession = {
  kind: "patient",
  clinicId: "clinic_cinghe",
  patientId: "pt_07",
  method: "link",
  at: new Date().toISOString(),
};

describe("session kind 邊界", () => {
  it("員工 session 不會被當作病人 session", () => {
    expect(isStaffSession(staffSession)).toBe(true);
    expect(isPatientSession(staffSession)).toBe(false);
  });

  it("病人 session 不會被當作員工 session", () => {
    expect(isPatientSession(patientSession)).toBe(true);
    expect(isStaffSession(patientSession)).toBe(false);
  });

  it("被竄改或缺欄位的資料一律無效", () => {
    expect(isStaffSession({ kind: "staff" })).toBe(false);
    expect(isPatientSession({ kind: "patient", clinicId: "clinic_cinghe" })).toBe(false);
    expect(isStaffSession(null)).toBe(false);
    expect(isPatientSession("pt_07")).toBe(false);
    expect(isStaffSession({ ...patientSession, kind: "staff" })).toBe(false);
  });
});

describe("病人專屬連結白名單", () => {
  it("沒有參數時進入示範病人空間", () => {
    expect(resolvePortalPatientId(undefined, [], "pt_07")).toBe("pt_07");
  });

  it("隨意改 URL 參數不能讀取其他病人", () => {
    expect(resolvePortalPatientId("pt_02", [], "pt_07")).toBeNull();
    expect(resolvePortalPatientId("../pt_03", ["pt_02"], "pt_07")).toBeNull();
  });

  it("診所曾經發出過的連結才有效", () => {
    expect(resolvePortalPatientId("pt_02", ["pt_02"], "pt_07")).toBe("pt_02");
  });
});

describe("病人資料過濾（clinicId + patientId 雙重收窄）", () => {
  const repo = new InMemoryClinicRepository();
  const clinicId = "clinic_cinghe";
  const patientId = "pt_07";

  it("所有讀取都只回傳自己且同一診所的資料", () => {
    for (const rows of [
      ownAppointments(repo, clinicId, patientId),
      ownConversations(repo, clinicId, patientId),
      ownDocuments(repo, clinicId, patientId),
      ownReminders(repo, clinicId, patientId),
    ] as { clinicId: string; patientId: string }[][]) {
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.clinicId === clinicId && r.patientId === patientId)).toBe(true);
    }
  });

  it("換成另一診所時讀不到任何資料", () => {
    expect(ownAppointments(repo, "clinic_haiyue", patientId)).toHaveLength(0);
    expect(ownConversations(repo, "clinic_haiyue", patientId)).toHaveLength(0);
    expect(ownDocuments(repo, "clinic_haiyue", patientId)).toHaveLength(0);
    expect(ownReminders(repo, "clinic_haiyue", patientId)).toHaveLength(0);
  });

  it("空檔 DTO 只有 startAt 與 practitionerId", () => {
    const clinic = repo.getClinic(clinicId)!;
    const slots = availableSlots(repo, clinic, "staff_dr_lam");
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(Object.keys(s).sort()).toEqual(["practitionerId", "startAt"]);
  });
});
