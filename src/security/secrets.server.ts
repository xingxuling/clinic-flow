import { env } from "node:process";
import { createServerOnlyFn } from "@tanstack/react-start";

function requireSecret(name: "CLINIC_FLOW_TOKEN_SECRET" | "CLINIC_FLOW_SESSION_SECRET"): string {
  const secret = env[name];
  if (!secret || secret.length < 32) {
    throw new Error(`${name}_MISSING_OR_TOO_SHORT`);
  }
  return secret;
}

/** 只在服务器读取；永远不要通过 VITE_ 前缀暴露到客户端。 */
export const getAccessTokenSecret = createServerOnlyFn(() =>
  requireSecret("CLINIC_FLOW_TOKEN_SECRET"),
);

/** HttpOnly 会话加密/签名密钥，与入口 Token 密钥分离，便于独立轮换。 */
export const getSessionSecret = createServerOnlyFn(() =>
  requireSecret("CLINIC_FLOW_SESSION_SECRET"),
);
