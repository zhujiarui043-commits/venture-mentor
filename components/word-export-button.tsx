"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import type { Artifact } from "@/lib/types";

export function WordExportButton({artifact}: {artifact: Artifact}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const {createInterviewWord, interviewWordFilename} = await import("@/lib/interview-word");
      const bytes = createInterviewWord(artifact);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], {type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}));
      const link = document.createElement("a");
      link.href = url; link.download = interviewWordFilename(artifact);
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      setError("Word 导出失败，请重试。");
    } finally { setBusy(false); }
  }
  return <div className="word-export">
    <button type="button" className="word-export-button" disabled={busy} onClick={() => void download()} aria-label={`将“${artifact.title}”导出为 Word`}>
      {busy ? <LoaderCircle size={16} className="spin"/> : <Download size={16}/>} {busy ? "正在生成…" : "导出 Word"}
    </button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
