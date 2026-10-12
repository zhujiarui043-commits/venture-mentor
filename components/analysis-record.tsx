"use client";

import type { ReactNode } from "react";
import { ChevronRight, ChevronUp } from "lucide-react";
import { analysisRecordTitle, type Artifact } from "@/lib/types";
import { WordExportButton } from "./word-export-button";

export function AnalysisRecord({artifact: a, children, pending = false, expanded = false}: {artifact: Artifact; children: ReactNode; pending?: boolean; expanded?: boolean}) {
  const preview = a.content.replace(/[#*`>|]/gu, "").replace(/\s+/gu, " ").trim().slice(0, 180);
  return <article className={`artifact-card${pending ? " pending-record" : ""}`}>
    <details className="analysis-record" open={expanded || undefined}>
      <summary>
        <div className="artifact-top"><span>{pending ? "待确认" : `分析记录${a.recordId ? ` ${a.recordId}` : ""}`}</span><time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleDateString("zh-CN")}</time></div>
        <div className="record-heading"><h3>{analysisRecordTitle(a)}</h3><ChevronRight size={19} className="record-chevron" aria-hidden="true"/></div>
        {preview && <p className="record-preview">{preview}</p>}
        <span className="record-toggle"><span className="record-expand-label">展开完整内容</span><span className="record-collapse-label">收起内容</span></span>
      </summary>
      <div className="record-body">{children}</div>
      <button type="button" className="record-collapse-bottom" onClick={event => {
        const record = event.currentTarget.closest<HTMLDetailsElement>("details.analysis-record");
        if (!record) return;
        record.open = false;
        const summary = record.querySelector("summary");
        summary?.focus({preventScroll:true});
        summary?.scrollIntoView({block:"nearest"});
      }}>收起<ChevronUp size={14} aria-hidden="true"/></button>
    </details>
    {a.section === "research" && <div className="record-actions"><WordExportButton artifact={a} pending={pending}/></div>}
  </article>;
}
