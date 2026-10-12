import { env } from "cloudflare:workers";
import { scrypt, timingSafeEqual } from "node:crypto";
import { isEmailIdentifier } from "./login-identifier";

const emailCookie = "mentor_email_session", legacyCookie = "mentor_team_session", sessionAge = 7 * 86400;
const encoder = new TextEncoder();
type Body = Record<string, unknown>;
type UserRow = { id: string; password_hash: string; recovery_hash: string };
class AuthError extends Error { constructor(message: string, public status = 400) { super(message); } }
const now = () => Math.floor(Date.now() / 1000);
const randomToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
function database() {
  if (!env.DB) throw new AuthError("邮箱账号服务暂不可用。", 503);
  return env.DB;
}
async function secretHash(value: string) {
  const secret = (env as unknown as Record<string, string>).SESSION_SECRET || "";
  if (secret.length < 24) throw new AuthError("登录服务尚未配置会话密钥。", 503);
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", key, encoder.encode(value))).toString("hex");
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new AuthError("请从网站页面提交请求。", 403);
}
export async function readLoginBody(request: Request, allowLegacyCode = false): Promise<Body> {
  assertSameOrigin(request);
  const json = request.headers.get("content-type")?.toLowerCase().startsWith("application/json");
  if ((!json && !allowLegacyCode) || !request.body) throw new AuthError("请提交正确的登录信息。", 415);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12288) { await reader.cancel(); throw new AuthError("登录信息过长。", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    const parsed = body as Body;
    if (!json && (typeof parsed.code !== "string" || parsed.identifier !== undefined)) throw new AuthError("请提交 JSON 格式的登录信息。", 415);
    return parsed;
  } catch (error) { if (error instanceof AuthError) throw error; throw new AuthError("登录信息格式不正确。"); }
}
function emailValue(value: unknown) {
  if (typeof value !== "string" || !isEmailIdentifier(value)) throw new AuthError("请输入完整的邮箱地址。");
  return value.trim().toLowerCase();
}
function passwordValue(value: unknown) {
  if (typeof value !== "string" || [...value].length < 12 || value.length > 128) throw new AuthError("密码需为 12–128 个字符。");
  return value;
}
function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
async function hashPassword(password: string) {
  const salt = randomToken();
  return `scrypt$32768$8$3$${salt}$${(await derivePassword(password, salt)).toString("hex")}`;
}
async function verifyPassword(password: string, encoded: string) {
  const [kind, n, r, p, salt, hash, extra] = encoded.split("$");
  if (extra || kind !== "scrypt" || n !== "32768" || r !== "8" || p !== "3" || !salt || !/^[a-f0-9]{128}$/u.test(hash || "")) return false;
  return timingSafeEqual(await derivePassword(password, salt), Buffer.from(hash, "hex"));
}
function cookieValue(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
}
function cookie(request: Request, name: string, value: string, age: number) {
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
function response(request: Request, data: unknown, status = 200, active?: { name: string; value: string; age: number }) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (active) {
    headers.append("Set-Cookie", cookie(request, active.name, active.value, active.age));
    headers.append("Set-Cookie", cookie(request, active.name === emailCookie ? legacyCookie : emailCookie, "", 0));
  }
  return Response.json(data, { status, headers });
}
export const testCodeResponse = (request: Request, token: string) => response(request, { ok: true }, 200, { name: legacyCookie, value: token, age: 86400 });
export function authFailure(error: unknown) {
  if (!(error instanceof AuthError)) console.error("Login operation failed", error);
  const missingTables = /no such table: (?:users|email_sessions|email_auth_limits)/u.test(String(error));
  return Response.json({ error: error instanceof AuthError ? error.message : missingTables ? "邮箱账号服务尚未初始化，请先完成账号数据库迁移。" : "登录服务暂时不可用，请稍后重试。" },
    { status: error instanceof AuthError ? error.status : missingTables ? 503 : 500, headers: { "Cache-Control": "no-store" } });
}
async function rateLimit(request: Request, scope: string, email: string) {
  const db = database(), time = now();
  const subjects: [string, number, number][] = [[request.headers.get("cf-connecting-ip") || "local", scope === "register" ? 8 : 30, 3600], [email, 15, 900]];
  for (const [index, [subject, limit, period]] of subjects.entries()) {
    const expiry = (Math.floor(time / period) + 1) * period;
    const key = `${scope}:${index}:${await secretHash(subject)}:${expiry}`;
    const row = await db.prepare("INSERT INTO email_auth_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind(key, expiry).first<{ count: number }>();
    if ((row?.count || 0) > limit) throw new AuthError("尝试次数较多，请稍后再试。", 429);
  }
  if (crypto.getRandomValues(new Uint8Array(1))[0] < 4) await db.batch([db.prepare("DELETE FROM email_auth_limits WHERE expires_at<?").bind(time), db.prepare("DELETE FROM email_sessions WHERE expires_at<?").bind(time)]);
}
export async function emailSignIn(request: Request, body: Body) {
  const email = emailValue(body.identifier);
  await rateLimit(request, "login", email);
  if (typeof body.password !== "string" || !body.password || body.password.length > 128) throw new AuthError("请输入密码。");
  const db = database();
  const user = await db.prepare("SELECT id,password_hash,recovery_hash FROM users WHERE email=?").bind(email).first<UserRow>();
  const matches = await verifyPassword(body.password, user?.password_hash || `scrypt$32768$8$3$unregistered-email$${"00".repeat(64)}`);
  if (!user || !matches) throw new AuthError("邮箱或密码不正确。", 401);
  const token = randomToken();
  const result = await db.prepare("INSERT INTO email_sessions (token_hash,user_id,expires_at) SELECT ?,id,? FROM users WHERE id=? AND password_hash=? AND recovery_hash=?")
    .bind(await secretHash(token), now() + sessionAge, user.id, user.password_hash, user.recovery_hash).run();
  if (result.meta.changes !== 1) throw new AuthError("账号信息已更新，请重新登录。", 409);
  return response(request, { ok: true }, 200, { name: emailCookie, value: token, age: sessionAge });
}
export async function register(request: Request) {
  const body = await readLoginBody(request), email = emailValue(body.identifier);
  await rateLimit(request, "register", email);
  const password = passwordValue(body.password);
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 40) throw new AuthError("请输入 1–40 个字符的昵称。");
  const db = database(), id = `u_${crypto.randomUUID()}`, recoveryCode = randomToken(), token = randomToken();
  const passwordHash = await hashPassword(password), recoveryHash = await secretHash(recoveryCode), tokenHash = await secretHash(token);
  try {
    await db.batch([
      db.prepare("INSERT INTO users (id,email,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)").bind(id, email, body.name.trim(), passwordHash, recoveryHash, now()),
      db.prepare("INSERT INTO email_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(tokenHash, id, now() + sessionAge),
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed: users.email/u.test(String(error))) throw new AuthError("这个邮箱已注册，请直接登录。", 409);
    throw error;
  }
  return response(request, { ok: true, recoveryCode }, 201, { name: emailCookie, value: token, age: sessionAge });
}
export async function recover(request: Request) {
  const body = await readLoginBody(request), email = emailValue(body.identifier);
  await rateLimit(request, "recover", email);
  const password = passwordValue(body.password);
  if (typeof body.recoveryCode !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(body.recoveryCode)) throw new AuthError("请输入注册时保存的账号恢复码。");
  const db = database(), originalHash = await secretHash(body.recoveryCode);
  const user = await db.prepare("SELECT id FROM users WHERE email=? AND recovery_hash=?").bind(email, originalHash).first<{ id: string }>();
  if (!user) throw new AuthError("邮箱或恢复码不正确。", 401);
  const recoveryCode = randomToken(), passwordHash = await hashPassword(password), recoveryHash = await secretHash(recoveryCode);
  const results = await db.batch([
    db.prepare("UPDATE users SET password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=? RETURNING id").bind(passwordHash, recoveryHash, user.id, originalHash),
    db.prepare("DELETE FROM email_sessions WHERE user_id=? AND changes()>0").bind(user.id),
  ]);
  if (results[0].results.length !== 1) throw new AuthError("恢复码已使用，请使用新的恢复码。", 409);
  return response(request, { ok: true, recoveryCode });
}
export async function signOut(request: Request) {
  assertSameOrigin(request);
  const token = cookieValue(request, emailCookie);
  if (token && /^[A-Za-z0-9_-]{43}$/u.test(token)) await database().prepare("DELETE FROM email_sessions WHERE token_hash=?").bind(await secretHash(token)).run();
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", cookie(request, legacyCookie, "", 0));
  headers.append("Set-Cookie", cookie(request, emailCookie, "", 0));
  return Response.json({ ok: true }, { headers });
}
export async function currentEmailTester(request: Request) {
  if (!["GET", "HEAD"].includes(request.method)) assertSameOrigin(request);
  const token = cookieValue(request, emailCookie);
  if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return null;
  const session = await database().prepare("SELECT u.id FROM email_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?")
    .bind(await secretHash(token), now()).first<{ id: string }>();
  return session ? `account-${session.id}` : null;
}
