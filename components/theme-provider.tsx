"use client";

import { ThemeProvider as Provider } from "next-themes";
import type { ReactNode } from "react";

export function ThemeProvider({children}: {children: ReactNode}) {
  return <Provider attribute="class" defaultTheme="system" enableSystem storageKey="venture-mentor-theme" disableTransitionOnChange>{children}</Provider>;
}
