"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { GripVertical, Maximize2, Minimize2, X } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

const DEFAULT_WIDTH = 520;
const MIN_WIDTH = 360;
const MAX_WIDTH = 920;

export function mentorPanelBounds(workspaceWidth: number) {
  return {min: MIN_WIDTH, max: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, workspaceWidth > 0 ? workspaceWidth - 320 : MAX_WIDTH))};
}

export function MentorWorkspace({open, fullscreen, onFullscreenChange, onClose, header, chat, children}: {
  open: boolean; fullscreen: boolean; onFullscreenChange: (value: boolean) => void;
  onClose: () => void; header?: ReactNode; chat: ReactNode; children: ReactNode;
}) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{pointerId: number; x: number; width: number} | null>(null);
  const [preferredWidth, setPreferredWidth] = useState(DEFAULT_WIDTH);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [resizing, setResizing] = useState(false);
  const bounds = mentorPanelBounds(workspaceWidth);
  const width = Math.max(bounds.min, Math.min(bounds.max, preferredWidth));
  const expanded = open && fullscreen;

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const observer = new ResizeObserver(entries => setWorkspaceWidth(entries[0].contentRect.width));
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const panel = panelRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.querySelectorAll<HTMLElement>(".mentor-nav, .topbar")).map(element => ({element, inert:element.inert}));
    for (const {element} of background) element.inert = true;
    document.body.style.overflow = "hidden";
    fullscreenButtonRef.current?.focus({preventScroll:true});
    function keys(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onFullscreenChange(false); return; }
      if (event.key !== "Tab" || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex="0"]')).filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {event.preventDefault(); last?.focus();}
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {event.preventDefault(); first?.focus();}
    }
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      document.body.style.overflow = previousOverflow;
      for (const {element, inert} of background) element.inert = inert;
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
      else document.getElementById("mentor-toggle")?.focus({preventScroll:true});
    };
  }, [expanded, onFullscreenChange]);

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || fullscreen || window.matchMedia("(max-width: 780px)").matches) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {pointerId:event.pointerId, x:event.clientX, width};
    setResizing(true);
  }
  function resize(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPreferredWidth(Math.max(bounds.min, Math.min(bounds.max, drag.width + drag.x - event.clientX)));
  }
  function stopResize(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <div ref={workspaceRef} className={`body-grid ${open ? "with-chat" : ""} ${expanded ? "chat-fullscreen" : ""} ${resizing ? "chat-resizing" : ""}`} style={{"--mentor-panel-width":`${width}px`} as CSSProperties}>
    {header}
    {children}
    {open && <aside ref={panelRef} id="mentor-panel" className={`mentor-panel ${expanded ? "mentor-panel-fullscreen" : ""}`} role={expanded ? "dialog" : undefined} aria-modal={expanded ? true : undefined} aria-label="AI 创业导师对话">
      {!expanded && <div className="mentor-resize-handle" role="separator" tabIndex={0} aria-label="调整导师对话宽度" aria-orientation="vertical" aria-valuemin={bounds.min} aria-valuemax={bounds.max} aria-valuenow={Math.round(width)} aria-valuetext={`${Math.round(width)} 像素`} aria-controls="mentor-panel" title="拖动调整宽度，也可使用左右方向键"
        onPointerDown={startResize} onPointerMove={resize} onPointerUp={stopResize} onPointerCancel={stopResize} onLostPointerCapture={stopResize}
        onKeyDown={event => {
          const step = event.shiftKey ? 50 : 20;
          const next = event.key === "ArrowLeft" ? width + step : event.key === "ArrowRight" ? width - step : event.key === "Home" ? bounds.min : event.key === "End" ? bounds.max : null;
          if (next !== null) {event.preventDefault(); setPreferredWidth(Math.max(bounds.min, Math.min(bounds.max, next)));}
        }}><span className="mentor-resize-grip"><GripVertical size={15} aria-hidden="true"/></span></div>}
      <div className="mentor-header">
        <span className="mentor-avatar" aria-hidden="true">启</span>
        <div className="mentor-header-copy"><strong>AI 创业导师</strong><small><span className="status-dot" aria-hidden="true"/> 陪你厘清每一步</small></div>
        <div className="mentor-panel-actions">
          {expanded && <ThemeToggle/>}
          <button ref={fullscreenButtonRef} type="button" className="mentor-fullscreen-button" aria-label={expanded ? "退出导师全屏" : "全屏显示导师对话"} aria-pressed={expanded} title={expanded ? "退出全屏（Esc）" : "全屏显示"} onClick={() => onFullscreenChange(!expanded)}>{expanded ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}</button>
          <button type="button" className={`mobile-chat-close ${expanded ? "fullscreen-chat-close" : ""}`} onClick={onClose} aria-label="收起导师"><X size={18}/></button>
        </div>
      </div>
      {chat}
    </aside>}
  </div>;
}
