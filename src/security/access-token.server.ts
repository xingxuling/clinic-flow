import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  issuePatientPortalToken,
  issueStaffInviteToken,
  verifyAccessToken,
  type AccessTokenKind,
} from "@/security/signed-token";
import { getAccessTokenSecret } from "@/security/secrets.server";
import type { ID } from "@/types/domain";

/**
 * 仅服务器内部可调用：真正接数据库后，应只在已验证员工权限的服务端流程中签发。
 */
export async function issuePatientPortalTokenServer(input: {
  clinicId: ID;
  patientId: ID;
  ttlSeconds?: number;
  jti?: string;
}): Promise<string> {
  return issuePatientPortalToken({
    ...input,
    secret: getAccessTokenSecret(),
  });
}

/** 员工邀请二维码同样只允许服务端签发。 */
export async function issueStaffInviteTokenServer(input: {
  clinicId: ID;
  inviteId: ID;
  ttlSeconds?: number;
  jti?: string;
}): Promise<string> {
  return issueStaffInviteToken({
    ...input,
    secret: getAccessTokenSecret(),
  });
}

const verifySchema = z.object({
  token: z.string().min(32).max(4096),
  expectedKind: z.enum(["patient_portal", "staff_invite"]),
  expectedClinicId: z.string().min(1).max(128),
});

export interface VerifiedAccessClaim {
  kind: AccessTokenKind;
  clinicId: ID;
  subjectId: ID;
  exp: number;
  jti: string;
}

export async function verifyAccessTokenServerOnly(input: {
  token: string;
  expectedKind: AccessTokenKind;
  expectedClinicId: ID;
}): Promise<
  | { ok: true; claim: VerifiedAccessClaim }
  | {
      ok: false;
      reason:
        | "TOKEN_FORMAT_INVALID"
        | "TOKEN_SIGNATURE_INVALID"
        | "TOKEN_PAYLOAD_INVALID"
        | "TOKEN_EXPIRED"
        | "SECRET_TOO_SHORT"
        | "TOKEN_KIND_MISMATCH"
        | "TOKEN_TENANT_MISMATCH";
    }
> {
  const result = await verifyAccessToken(input.token, getAccessTokenSecret());
  if (!result.ok) return result;

  if (result.payload.kind !== input.expectedKind) {
    return { ok: false, reason: "TOKEN_KIND_MISMATCH" };
  }
  if (result.payload.clinicId !== input.expectedClinicId) {
    return { ok: false, reason: "TOKEN_TENANT_MISMATCH" };
  }

  const subjectId =
    result.payload.kind === "patient_portal"
      ? result.payload.patientId
      : result.payload.inviteId;

  return {
    ok: true,
    claim: {
      kind: result.payload.kind,
      clinicId: result.payload.clinicId,
      subjectId,
      exp: result.payload.exp,
      jti: result.payload.jti,
    },
  };
}

/**
 * 可由客户端调用，但所有密码学验证都在服务器执行。
 * 返回值只保留建立 session 所需的最小 claim，不回传任何姓名、电话或病历资料。
 */
export const verifySignedAccessTokenServer = createServerFn({ method: "POST" })
  .validator(verifySchema)
  .handler(async ({ data }) => verifyAccessTokenServerOnly(data));
