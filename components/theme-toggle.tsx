"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ThemeToggle() {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const {resolvedTheme, setTheme} = useTheme();
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "切换到浅色模式" : "切换到深色模式";
  return <button type="button" className="theme-toggle" disabled={!mounted} aria-label={label} title={label} aria-pressed={dark} onClick={() => setTheme(dark ? "light" : "dark")}>
    {dark ? <Sun size={17} aria-hidden="true"/> : <Moon size={17} aria-hidden="true"/>}
  </button>;
}
