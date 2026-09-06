/**
 * 病人前台專用讀取層。
 *
 * 安全原則：病人端**只能**看到自己的資料。所有函式都同時以 clinicId + patientId 收窄，
 * 並且永不回傳其他病人的預約、對話、文件或內部風險規則。
 * 改期時病人只會取得「可選空檔」清單，而不是整份診所排班表。
 */
import type { ClinicRepository } from "./repository";
import type { Appointment, Clinic, Conversation, DocumentCase, ID, Reminder } from "@/types/domain";

export interface AvailableSlot {
  startAt: string;
  practitionerId: ID;
}

export function ownAppointments(
  repo: ClinicRepository,
  clinicId: ID,
  patientId: ID,
): Appointment[] {
  return repo.listAppointments(clinicId).filter((a) => a.patientId === patientId);
}

export function ownConversations(
  repo: ClinicRepository,
  clinicId: ID,
  patientId: ID,
): Conversation[] {
  return repo.listConversations(clinicId).filter((c) => c.patientId === patientId);
}

export function ownDocuments(
  repo: ClinicRepository,
  clinicId: ID,
  patientId: ID,
): DocumentCase[] {
  return repo.listDocuments(clinicId).filter((d) => d.patientId === patientId);
}

export function ownReminders(repo: ClinicRepository, clinicId: ID, patientId: ID): Reminder[] {
  return repo
    .listReminders(clinicId)
    .filter((r) => r.patientId === patientId && r.status !== "cancelled");
}

/**
 * 產生病人可選的改期空檔。
 *
 * 只回傳「時間點 + 負責醫生／治療師 id」，不包含任何其他病人資料，
 * 也不透露該時段被誰佔用。
 */
export function availableSlots(
  repo: ClinicRepository,
  clinic: Clinic,
  practitionerId: ID,
  fromDayOffset = 1,
  days = 5,
): AvailableSlot[] {
  const taken = new Set(
    repo
      .listAppointments(clinic.id)
      .filter((a) => a.practitionerId === practitionerId && a.status !== "cancelled")
      .map((a) => new Date(a.startAt).getTime()),
  );

  const slots: AvailableSlot[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  for (let d = fromDayOffset; d < fromDayOffset + days; d++) {
    const day = new Date(base.getTime() + d * 864e5);
    const hours = clinic.businessHours.find((h) => h.weekday === day.getDay());
    if (!hours || hours.closed) continue;
    const [openH, openM] = hours.open.split(":").map(Number);
    const [closeH] = hours.close.split(":").map(Number);
    for (let h = openH!; h < closeH!; h++) {
      for (const m of [openM === 30 && h === openH ? 30 : 0, 30]) {
        const t = new Date(day);
        t.setHours(h, m, 0, 0);
        if (t.getTime() <= Date.now()) continue;
        if (taken.has(t.getTime())) continue;
        if (slots.some((s) => new Date(s.startAt).getTime() === t.getTime())) continue;
        slots.push({ startAt: t.toISOString(), practitionerId });
      }
    }
  }
  return slots.slice(0, 24);
}
