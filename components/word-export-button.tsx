"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { analysisRecordTitle, type Artifact } from "@/lib/types";
import { createAnalysisWord, analysisWordFilename } from "@/lib/interview-word";

export function WordExportButton({artifact, pending = false}: {artifact: Artifact; pending?: boolean}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function download() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      // Keep export code loaded with the page. An open page must still export
      // after a deployment replaces its old, lazily loaded asset URLs.
      const bytes = createAnalysisWord(artifact, pending);
      const filename = analysisWordFilename(artifact);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], {type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}));
      const link = document.createElement("a");
      link.href = url; link.download = filename;
      try {
        document.body.appendChild(link); link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    } catch (cause) {
      console.error("Word export failed", cause);
      setError("Word 导出失败，请重试。");
    } finally { setBusy(false); }
  }
  return <div className="word-export">
    <button type="button" className="word-export-button" disabled={busy} onClick={() => void download()} aria-label={`将“${analysisRecordTitle(artifact)}”导出为 Word`}>
      {busy ? <LoaderCircle size={16} className="spin"/> : <Download size={16}/>} {busy ? "正在生成…" : "导出 Word"}
    </button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
