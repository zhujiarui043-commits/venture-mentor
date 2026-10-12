import { env } from "cloudflare:workers";
import { isEmailIdentifier } from "./login-identifier";
import { assertSameOrigin, currentEmailTester, emailSignIn, readLoginBody, testCodeResponse } from "./email-accounts";
export { authFailure, register, recover, signOut } from "./email-accounts";

const cookieName = "mentor_team_session";
const encoder = new TextEncoder();

function settings() {
  const secrets = env as unknown as Record<string, string>;
  let codes: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(secrets.TEST_ACCESS_CODES || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    codes = parsed as Record<string, string>;
  } catch { throw new Error("团队测试码配置格式不正确。"); }
  const sessionSecret = secrets.SESSION_SECRET || "";
  if (!sessionSecret || sessionSecret.length < 24) {
    throw new Error("团队测试码或会话密钥尚未配置");
  }
  return { codes, sessionSecret };
}

async function signature(id: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(id)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function signIn(request: Request) {
  const body = await readLoginBody(request, true);
  if (typeof body.identifier === "string" && isEmailIdentifier(body.identifier)) return emailSignIn(request, body);
  const { codes, sessionSecret } = settings();
  const code = typeof body.identifier === "string" ? body.identifier.trim() : body.code;
  if (typeof code !== "string" || !code || code.length > 256) return Response.json({ error: "请输入邮箱或测试码。" }, { status: 400 });
  const id = Object.keys(codes).find(name => /^[a-zA-Z0-9_-]{1,32}$/.test(name) && typeof codes[name] === "string" && codes[name].length >= 16 && codes[name] === code);
  if (!id) return Response.json({ error: "测试码不正确；使用邮箱时请输入完整地址。" }, { status: 401 });
  const expires = Math.floor(Date.now() / 1000) + 86400;
  const token = `${id}.${expires}.${await signature(`${id}.${expires}`, sessionSecret)}`;
  return testCodeResponse(request, token);
}

export async function currentTester(request: Request) {
  if (!["GET", "HEAD"].includes(request.method)) assertSameOrigin(request);
  if (request.headers.get("cookie")?.split(";").some(value => value.trim().startsWith("mentor_email_session="))) return currentEmailTester(request);
  const { codes, sessionSecret } = settings();
  const cookie = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`));
  const token = cookie?.slice(cookieName.length + 1) || "";
  const [id, expires, signed, extra] = token.split(".");
  if (!id || !expires || !signed || extra || !Object.hasOwn(codes, id) || !/^\d{10}$/.test(expires) || Number(expires) <= Math.floor(Date.now() / 1000)) return null;
  const expected = await signature(`${id}.${expires}`, sessionSecret);
  const a = encoder.encode(signed), b = encoder.encode(expected);
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 ? id : null;
}

export const projectIdFor = (tester: string) => `team-${tester}`;
export const unauthorized = () => Response.json({ error: "请先使用邮箱或测试码登录。" }, { status: 401, headers: { "Cache-Control": "no-store" } });
