import { env } from "node:process";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";

import { verifyAccessTokenServerOnly } from "@/security/access-token.server";
import { getSessionSecret } from "@/security/secrets.server";
import type { ID, StaffRole } from "@/types/domain";

export type ClinicSessionKind = "patient" | "staff";

export interface ClinicSessionData {
  kind?: ClinicSessionKind;
  clinicId?: ID;
  subjectId?: ID;
  role?: StaffRole;
  authenticatedAt?: number;
  expiresAt?: number;
  deviceBound?: boolean;
}

const PATIENT_SESSION_SECONDS = 30 * 60;
const STAFF_SESSION_SECONDS = 8 * 60 * 60;

const useClinicSession = createServerOnlyFn(() =>
  useSession<ClinicSessionData>({
    name: "clinic-flow-session",
    password: getSessionSecret(),
    cookie: {
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
      maxAge: STAFF_SESSION_SECONDS,
    },
  }),
);

function sessionExpiry(ttlSeconds: number): number {
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}

const patientExchangeSchema = z.object({
  token: z.string().min(32).max(4096),
  clinicId: z.string().min(1).max(128),
});

/**
 * 病人专属短时 Token 只负责敲门；成功后换成 HttpOnly Cookie。
 * 浏览器 JavaScript 无法读取 Cookie 内容。
 */
export const exchangePatientPortalTokenServer = createServerFn({ method: "POST" })
  .validator(patientExchangeSchema)
  .handler(async ({ data }) => {
    const verified = await verifyAccessTokenServerOnly({
      token: data.token,
      expectedKind: "patient_portal",
      expectedClinicId: data.clinicId,
    });
    if (!verified.ok) return verified;

    const session = await useClinicSession();
    const now = Math.floor(Date.now() / 1000);
    await session.update({
      kind: "patient",
      clinicId: verified.claim.clinicId,
      subjectId: verified.claim.subjectId,
      authenticatedAt: now,
      expiresAt: sessionExpiry(PATIENT_SESSION_SECONDS),
      deviceBound: false,
    });

    return {
      ok: true as const,
      session: {
        kind: "patient" as const,
        clinicId: verified.claim.clinicId,
        subjectId: verified.claim.subjectId,
        expiresAt: sessionExpiry(PATIENT_SESSION_SECONDS),
      },
    };
  });

/**
 * 员工身份必须先由邀请 / Passkey 流程在服务器确认，之后才能调用此内部函数。
 * 它不是浏览器可直接调用的 RPC。
 */
export const establishStaffSessionServer = createServerOnlyFn(
  async (input: {
    clinicId: ID;
    staffId: ID;
    role: StaffRole;
    deviceBound: boolean;
  }) => {
    const session = await useClinicSession();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = sessionExpiry(STAFF_SESSION_SECONDS);
    await session.update({
      kind: "staff",
      clinicId: input.clinicId,
      subjectId: input.staffId,
      role: input.role,
      authenticatedAt: now,
      expiresAt,
      deviceBound: input.deviceBound,
    });
    return { ok: true as const, expiresAt };
  },
);

/** 返回最小身份，不返回病人资料、电话、病历或文件。 */
export const getCurrentClinicSessionServer = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useClinicSession();
  const data = session.data;
  const now = Math.floor(Date.now() / 1000);

  if (!data.kind || !data.clinicId || !data.subjectId || !data.expiresAt) return null;
  if (data.expiresAt <= now) {
    await session.clear();
    return null;
  }

  return {
    kind: data.kind,
    clinicId: data.clinicId,
    subjectId: data.subjectId,
    role: data.role,
    expiresAt: data.expiresAt,
    deviceBound: Boolean(data.deviceBound),
  };
});

export const clearClinicSessionServer = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useClinicSession();
  await session.clear();
  return { ok: true as const };
});
