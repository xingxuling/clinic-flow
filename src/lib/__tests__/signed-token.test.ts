import { describe, expect, it } from "vitest";

import {
  issuePatientPortalToken,
  issueStaffInviteToken,
  verifyAccessToken,
} from "@/security/signed-token";

const SECRET = "clinic-flow-demo-secret-at-least-32-bytes-long";
const NOW = Date.UTC(2026, 8, 7, 10, 0, 0);

describe("短时签名入口令牌", () => {
  it("病人链接只携带最小必要标识，不携带姓名或电话", async () => {
    const token = await issuePatientPortalToken({
      clinicId: "clinic_cinghe",
      patientId: "pt_07",
      secret: SECRET,
      nowMs: NOW,
      ttlSeconds: 600,
      jti: "patient-token-001",
    });

    const result = await verifyAccessToken(token, SECRET, NOW + 30_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.kind).toBe("patient_portal");
    if (result.payload.kind !== "patient_portal") return;
    expect(result.payload.patientId).toBe("pt_07");
    expect(result.payload.clinicId).toBe("clinic_cinghe");
    expect(JSON.stringify(result.payload)).not.toContain("9123");
    expect(JSON.stringify(result.payload)).not.toContain("陳");
  });

  it("员工二维码邀请可以验证", async () => {
    const token = await issueStaffInviteToken({
      clinicId: "clinic_cinghe",
      inviteId: "iv_001",
      secret: SECRET,
      nowMs: NOW,
      ttlSeconds: 300,
      jti: "staff-token-001",
    });

    const result = await verifyAccessToken(token, SECRET, NOW + 60_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.kind).toBe("staff_invite");
  });

  it("令牌过期后 fail-closed", async () => {
    const token = await issuePatientPortalToken({
      clinicId: "clinic_cinghe",
      patientId: "pt_07",
      secret: SECRET,
      nowMs: NOW,
      ttlSeconds: 60,
      jti: "expired-token-001",
    });

    expect(await verifyAccessToken(token, SECRET, NOW + 61_000)).toEqual({
      ok: false,
      reason: "TOKEN_EXPIRED",
    });
  });

  it("篡改内容或使用错误密钥都会被拒绝", async () => {
    const token = await issuePatientPortalToken({
      clinicId: "clinic_cinghe",
      patientId: "pt_07",
      secret: SECRET,
      nowMs: NOW,
      jti: "tamper-token-001",
    });
    const parts = token.split(".");
    const body = parts[1]!;
    const last = body.at(-1) === "A" ? "B" : "A";
    const tampered = `${parts[0]}.${body.slice(0, -1)}${last}.${parts[2]}`;

    const tamperedResult = await verifyAccessToken(tampered, SECRET, NOW + 1_000);
    expect(tamperedResult.ok).toBe(false);
    expect(
      await verifyAccessToken(token, "wrong-secret-but-still-long-enough-1234567890", NOW + 1_000),
    ).toEqual({ ok: false, reason: "TOKEN_SIGNATURE_INVALID" });
  });

  it("过短密钥不允许签发", async () => {
    await expect(
      issueStaffInviteToken({
        clinicId: "clinic_cinghe",
        inviteId: "iv_001",
        secret: "too-short",
        nowMs: NOW,
      }),
    ).rejects.toThrow("SECRET_TOO_SHORT");
  });
});
