import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
export const metadata: Metadata = { title: "启点 · AI 创业导师", description: "大学生创业创意诊断与验证工作台", icons: {icon:"/favicon.svg"} };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN" suppressHydrationWarning><head><link rel="preload" href="/fonts/source-han-ui.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/></head><body><ThemeProvider>{children}</ThemeProvider></body></html>}
