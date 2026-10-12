"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { isEmailIdentifier } from "@/lib/login-identifier";

type Mode = "login" | "register" | "recover";
export function LoginAccess({ onAuthenticated, initialError = "" }: { onAuthenticated: () => Promise<void>; initialError?: string }) {
  const [identifier, setIdentifier] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [name, setName] = useState(""), [recoveryInput, setRecoveryInput] = useState(""), [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [recoveryCode, setRecoveryCode] = useState("");
  const [saved, setSaved] = useState(false), [recoveryAction, setRecoveryAction] = useState<"enter" | "login">("enter");
  const passwordRef = useRef<HTMLInputElement>(null);
  const email = isEmailIdentifier(identifier);
  function changeMode(next: Mode) { setMode(next); setPassword(""); setConfirmation(""); setRecoveryInput(""); setError(""); }
  async function submit() {
    if (busy || recoveryCode || !identifier.trim()) return;
    setError("");
    if (email && !password) { passwordRef.current?.focus(); return; }
    if (email && mode !== "login" && ([...password].length < 12 || password.length > 128)) { setError("密码需为 12–128 个字符。"); return; }
    if (email && mode !== "login" && password !== confirmation) { setError("两次输入的密码不一致。"); return; }
    setBusy(true);
    try {
      const action = email ? mode : "login";
      const response = await fetch(`/api/${action}`, {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ identifier: identifier.trim(), ...(email ? { password, ...(mode === "register" ? { name } : {}), ...(mode === "recover" ? { recoveryCode: recoveryInput } : {}) } : {}) }),
      });
      const data = await response.json() as { error?: string; recoveryCode?: string };
      if (!response.ok) throw new Error(data.error || "无法登录，请稍后再试。");
      setPassword(""); setConfirmation(""); setRecoveryInput("");
      if (data.recoveryCode) { setRecoveryCode(data.recoveryCode); setSaved(false); setRecoveryAction(mode === "recover" ? "login" : "enter"); }
      else await onAuthenticated();
    } catch (cause) { setError(cause instanceof Error && ["AbortError", "TimeoutError"].includes(cause.name) ? "请求超时，请稍后重新登录。" : cause instanceof Error ? cause.message : "登录失败。"); }
    finally { setBusy(false); }
  }
  async function finishRecovery() {
    if (!saved || busy) return;
    if (recoveryAction === "login") { setRecoveryCode(""); changeMode("login"); return; }
    setBusy(true);
    try { await onAuthenticated(); }
    catch { setError("无法读取项目，请稍后重试。"); }
    finally { setBusy(false); }
  }
  return <div className="team-login">
    <header className="login-header"><span className="login-brand"><span className="brand-wordmark">启点</span><small>VENTURE STUDIO</small></span><div className="login-theme-toggle"><ThemeToggle /></div></header>
    <main className="login-layout">
      <section className="login-statement" aria-labelledby="login-slogan"><span className="login-eyebrow">AI 创业导师·从想法到行动</span><h1 id="login-slogan">每一个梦想，<br />都有一个启点。</h1><p>让创意有路径，让每一步都有依据。</p><span className="login-orbit" aria-hidden="true"><i /><i /><i /></span></section>
      <section className="team-login-card" aria-labelledby="workspace-login-title">
        <div className="login-kicker">PRIVATE WORKSPACE</div>
        <h2 id="workspace-login-title">{recoveryCode ? "保存账号恢复码" : mode === "register" && email ? "注册邮箱账号" : mode === "recover" && email ? "找回邮箱账号" : "进入你的工作空间"}</h2>
        {recoveryCode ? <>
          <p>请保存恢复码。忘记密码时需要使用它；当前不发送验证或找回邮件。{recoveryAction === "login" && "原恢复码已失效，请保存这份新恢复码。"}</p>
          <label className="login-label" htmlFor="account-recovery-code">账号恢复码</label>
          <Input id="account-recovery-code" value={recoveryCode} readOnly autoComplete="off" onFocus={event => event.target.select()} />
          <label className="login-saved"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />我已保存恢复码</label>
          <Button disabled={!saved || busy} onClick={() => void finishRecovery()}>{recoveryAction === "login" ? "返回邮箱登录" : busy ? "正在进入…" : "进入工作空间"}</Button>
        </> : <>
          <p>{mode === "register" && email ? "使用邮箱和密码创建账号，注册后保存账号恢复码。" : mode === "recover" && email ? "输入注册时保存的恢复码，并设置新密码。" : "输入邮箱或测试码。使用邮箱时，请继续填写密码。"}</p>
          <form onSubmit={event => { event.preventDefault(); void submit(); }} onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}>
            <label className="login-label" htmlFor="login-identifier">邮箱或测试码</label>
            <Input id="login-identifier" name="username" aria-label="邮箱或测试码" type="text" value={identifier} placeholder="邮箱或测试码" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={256} disabled={busy}
              onChange={event => { const next = event.target.value; setIdentifier(next); setPassword(""); setConfirmation(""); setRecoveryInput(""); setError(""); if (!isEmailIdentifier(next)) setMode("login"); }} />
            {email && <div className="login-email-fields">
              {mode === "register" && <><label className="login-label" htmlFor="account-name">昵称</label><Input id="account-name" value={name} onChange={event => setName(event.target.value)} autoComplete="nickname" maxLength={40} required disabled={busy} /></>}
              {mode === "recover" && <><label className="login-label" htmlFor="recovery-input">账号恢复码</label><Input id="recovery-input" value={recoveryInput} onChange={event => setRecoveryInput(event.target.value.trim())} autoComplete="off" maxLength={43} required disabled={busy} /></>}
              <label className="login-label" htmlFor="login-password">{mode === "recover" ? "新密码" : "密码"}</label>
              <Input id="login-password" name="password" ref={passwordRef} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "请输入密码" : "至少 12 个字符"} maxLength={128} disabled={busy} />
              {mode !== "login" && <><label className="login-label" htmlFor="password-confirmation">确认密码</label><Input id="password-confirmation" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" maxLength={128} required disabled={busy} /></>}
            </div>}
            <Button type="submit" disabled={busy || !identifier.trim()}>{busy ? "正在处理…" : email && mode === "register" ? "注册账号" : email && mode === "recover" ? "重设密码" : "进入工作空间"}</Button>
          </form>
          {email && <div className="login-account-actions">{mode === "login" ? <><button type="button" disabled={busy} onClick={() => changeMode("register")}>注册邮箱账号</button><button type="button" disabled={busy} onClick={() => changeMode("recover")}>忘记密码</button></> : <button type="button" disabled={busy} onClick={() => changeMode("login")}>返回邮箱登录</button>}</div>}
        </>}
        {(error || initialError) && <p className="error" role="alert">{error || initialError}</p>}
      </section>
    </main>
    <footer className="login-footer"><span>VENTURE IDEATION</span><span>RESEARCH · VALIDATE · BUILD</span></footer>
  </div>;
}
