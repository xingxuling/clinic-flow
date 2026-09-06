import type { ID } from "@/types/domain";

export type AccessTokenKind = "patient_portal" | "staff_invite";

interface AccessTokenBase {
  v: 1;
  kind: AccessTokenKind;
  clinicId: ID;
  iat: number;
  exp: number;
  jti: string;
}

export interface PatientPortalTokenPayload extends AccessTokenBase {
  kind: "patient_portal";
  patientId: ID;
}

export interface StaffInviteTokenPayload extends AccessTokenBase {
  kind: "staff_invite";
  inviteId: ID;
}

export type AccessTokenPayload = PatientPortalTokenPayload | StaffInviteTokenPayload;

export type VerifyAccessTokenResult =
  | { ok: true; payload: AccessTokenPayload }
  | {
      ok: false;
      reason:
        | "TOKEN_FORMAT_INVALID"
        | "TOKEN_SIGNATURE_INVALID"
        | "TOKEN_PAYLOAD_INVALID"
        | "TOKEN_EXPIRED"
        | "SECRET_TOO_SHORT";
    };

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(input: string): Uint8Array | null {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function encodeJson(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson(segment: string): unknown {
  const bytes = base64UrlToBytes(segment);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey | null> {
  if (secret.length < 32) return null;
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCommonPayload(value: Record<string, unknown>): boolean {
  return (
    value.v === 1 &&
    typeof value.clinicId === "string" &&
    value.clinicId.length > 0 &&
    typeof value.iat === "number" &&
    Number.isInteger(value.iat) &&
    typeof value.exp === "number" &&
    Number.isInteger(value.exp) &&
    value.exp > value.iat &&
    typeof value.jti === "string" &&
    value.jti.length >= 8
  );
}

function parsePayload(value: unknown): AccessTokenPayload | null {
  if (!isRecord(value) || !isCommonPayload(value)) return null;

  if (value.kind === "patient_portal" && typeof value.patientId === "string") {
    return value as unknown as PatientPortalTokenPayload;
  }

  if (value.kind === "staff_invite" && typeof value.inviteId === "string") {
    return value as unknown as StaffInviteTokenPayload;
  }

  return null;
}

async function signPayload(payload: AccessTokenPayload, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  if (!key) throw new Error("SECRET_TOO_SHORT");

  const header = encodeJson({ alg: "HS256", typ: "CFAT", v: 1 });
  const body = encodeJson(payload);
  const signingInput = `${header}.${body}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput)),
  );
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

export interface IssueTokenOptions {
  clinicId: ID;
  ttlSeconds?: number;
  nowMs?: number;
  jti?: string;
}

function issueBase(
  kind: AccessTokenKind,
  options: IssueTokenOptions,
): AccessTokenBase {
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const ttlSeconds = options.ttlSeconds ?? 10 * 60;
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 7 * 24 * 60 * 60) {
    throw new Error("TOKEN_TTL_INVALID");
  }
  return {
    v: 1,
    kind,
    clinicId: options.clinicId,
    iat: nowSeconds,
    exp: nowSeconds + Math.floor(ttlSeconds),
    jti: options.jti ?? crypto.randomUUID(),
  };
}

export async function issuePatientPortalToken(
  input: IssueTokenOptions & { patientId: ID; secret: string },
): Promise<string> {
  const payload: PatientPortalTokenPayload = {
    ...issueBase("patient_portal", input),
    kind: "patient_portal",
    patientId: input.patientId,
  };
  return signPayload(payload, input.secret);
}

export async function issueStaffInviteToken(
  input: IssueTokenOptions & { inviteId: ID; secret: string },
): Promise<string> {
  const payload: StaffInviteTokenPayload = {
    ...issueBase("staff_invite", input),
    kind: "staff_invite",
    inviteId: input.inviteId,
  };
  return signPayload(payload, input.secret);
}

export async function verifyAccessToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): Promise<VerifyAccessTokenResult> {
  const key = await importHmacKey(secret);
  if (!key) return { ok: false, reason: "SECRET_TOO_SHORT" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "TOKEN_FORMAT_INVALID" };
  const [headerSegment, bodySegment, signatureSegment] = parts;
  if (!headerSegment || !bodySegment || !signatureSegment) {
    return { ok: false, reason: "TOKEN_FORMAT_INVALID" };
  }

  const header = decodeJson(headerSegment);
  if (
    !isRecord(header) ||
    header.alg !== "HS256" ||
    header.typ !== "CFAT" ||
    header.v !== 1
  ) {
    return { ok: false, reason: "TOKEN_FORMAT_INVALID" };
  }

  const signature = base64UrlToBytes(signatureSegment);
  if (!signature) return { ok: false, reason: "TOKEN_FORMAT_INVALID" };

  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(`${headerSegment}.${bodySegment}`),
  );
  if (!verified) return { ok: false, reason: "TOKEN_SIGNATURE_INVALID" };

  const payload = parsePayload(decodeJson(bodySegment));
  if (!payload) return { ok: false, reason: "TOKEN_PAYLOAD_INVALID" };

  const nowSeconds = Math.floor(nowMs / 1000);
  if (payload.exp <= nowSeconds) return { ok: false, reason: "TOKEN_EXPIRED" };

  return { ok: true, payload };
}
