import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Artifact } from "@/lib/types";
import { WordExportButton } from "./word-export-button";

export function AnalysisRecord({artifact: a, children}: {artifact: Artifact; children: ReactNode}) {
  const preview = a.content.replace(/[#*`>|]/gu, "").replace(/\s+/gu, " ").trim().slice(0, 180);
  const interview = a.section === "research" && /访谈|采访|提纲|招募/u.test(a.title + "\n" + a.content) && !a.mvp && !a.survey && !a.funnel;
  return <article className="artifact-card">
    <details className="analysis-record">
      <summary>
        <div className="artifact-top"><span>分析成果 · V{a.version}</span><time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleDateString("zh-CN")}</time></div>
        <div className="record-heading"><h3>{a.title}</h3><ChevronRight size={19} className="record-chevron" aria-hidden="true"/></div>
        {preview && <p className="record-preview">{preview}</p>}
        <span className="record-toggle"><span className="record-expand-label">展开完整内容</span><span className="record-collapse-label">收起内容</span></span>
      </summary>
      <div className="record-body">{children}</div>
    </details>
    {interview && <div className="record-actions"><WordExportButton artifact={a}/></div>}
  </article>;
}
