import { env } from "node:process";

function requireSecret(name: "CLINIC_FLOW_TOKEN_SECRET" | "CLINIC_FLOW_SESSION_SECRET"): string {
  const secret = env[name];
  if (!secret || secret.length < 32) {
    throw new Error(`${name}_MISSING_OR_TOO_SHORT`);
  }
  return secret;
}

/** 只在 .server.ts 内读取；永远不要通过 VITE_ 前缀暴露到客户端。 */
export function getAccessTokenSecret(): string {
  return requireSecret("CLINIC_FLOW_TOKEN_SECRET");
}

/** HttpOnly 会话加密/签名密钥，与入口 Token 密钥分离，便于独立轮换。 */
export function getSessionSecret(): string {
  return requireSecret("CLINIC_FLOW_SESSION_SECRET");
}
