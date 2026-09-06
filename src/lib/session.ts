/**
 * 雙端身分邊界的純函式。
 *
 * 員工 session 與病人 session 使用不同 localStorage key，並且各自帶 `kind`。
 * 讀取時必須以 `kind` 校驗，避免任何一端的資料被當成另一端使用（互相冒充）。
 */
import type { ID, PatientSession, StaffSession } from "@/types/domain";

export function isStaffSession(value: unknown): value is StaffSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<StaffSession>;
  return v.kind === "staff" && typeof v.clinicId === "string" && typeof v.staffId === "string";
}

export function isPatientSession(value: unknown): value is PatientSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<PatientSession>;
  return v.kind === "patient" && typeof v.clinicId === "string" && typeof v.patientId === "string";
}

/**
 * 專屬連結白名單策略（示範版）。
 *
 * 真實環境應改為由伺服器簽發並驗證的一次性簽名 token；示範版以「診所曾經發出過此連結」
 * 的白名單模擬，確保單靠改 URL 的 `?p=` 參數不能讀取其他病人的資料。
 */
export function resolvePortalPatientId(
  requested: string | undefined,
  issued: readonly ID[],
  demoPatientId: ID,
): ID | null {
  if (!requested) return demoPatientId;
  if (requested === demoPatientId) return demoPatientId;
  return issued.includes(requested) ? requested : null;
}
