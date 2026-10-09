import { env } from "cloudflare:workers";

const cookieName = "mentor_team_session";
const encoder = new TextEncoder();

function settings() {
  const secrets = env as unknown as Record<string, string>;
  const codes = JSON.parse(secrets.TEST_ACCESS_CODES || "{}") as Record<string, string>;
  const sessionSecret = secrets.SESSION_SECRET || "";
  if (!sessionSecret || sessionSecret.length < 24 || !Object.keys(codes).length) {
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
  const { codes, sessionSecret } = settings();
  const { code } = await request.json() as { code?: string };
  const id = Object.keys(codes).find(name => /^[a-zA-Z0-9_-]{1,32}$/.test(name) && codes[name].length >= 16 && codes[name] === code);
  if (!id) return Response.json({ error: "测试码不正确" }, { status: 401 });
  const expires = Math.floor(Date.now() / 1000) + 86400;
  const token = `${id}.${expires}.${await signature(`${id}.${expires}`, sessionSecret)}`;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return Response.json({ ok: true }, { headers: { "Set-Cookie": `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure}`, "Cache-Control": "no-store" } });
}

export async function currentTester(request: Request) {
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
export const unauthorized = () => Response.json({ error: "请先输入测试码" }, { status: 401, headers: { "Cache-Control": "no-store" } });
