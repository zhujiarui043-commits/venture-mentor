import { MAX_STRUCTURED_FILE_BYTES, MAX_ATTACHMENTS, MAX_ATTACHMENT_CHARS, MAX_TOTAL_ATTACHMENT_CHARS, type Attachment } from "./materials";

export async function readAttachments(files: File[], existing: Attachment[], readStructuredFile: (file: File) => Promise<{text:string;warnings:string[]}>, progress?: (name:string,index:number,total:number) => void) {
  if (files.length + existing.length > MAX_ATTACHMENTS) throw new Error(`最多同时附加 ${MAX_ATTACHMENTS} 份材料，请先移除不需要的文档。`);
  const attachments = [...existing];
  const errors: string[] = [];
  let totalChars = existing.reduce((sum,item) => sum + item.text.length,0);
  for (const [index,file] of files.entries()) {
    progress?.(file.name,index+1,files.length);
    try {
      if (!/\.(txt|csv|md|docx|doc|xlsx|xls)$/iu.test(file.name)) throw new Error("支持 XLSX / DOCX / DOC / TXT / CSV / Markdown；旧版 XLS 请另存为 XLSX。");
      const isWord = /\.(docx|doc)$/iu.test(file.name);
      const isExcel = /\.(xlsx|xls)$/iu.test(file.name);
      if (file.size > (isWord || isExcel ? MAX_STRUCTURED_FILE_BYTES : 1000000)) throw new Error(isExcel ? "Excel 文件超过 20 MB。" : isWord ? "Word 文件超过 20 MB。" : "文件超过 1 MB。");
      const {text,warnings} = isWord || isExcel ? await readStructuredFile(file) : {text:await file.text(),warnings:[]};
      if (!text.trim()) throw new Error("没有可读正文。");
      if (text.length > MAX_ATTACHMENT_CHARS) throw new Error(`正文超过 ${MAX_ATTACHMENT_CHARS} 字，请拆分文档。`);
      if (totalChars + text.length > MAX_TOTAL_ATTACHMENT_CHARS) throw new Error(`正文合计超过 ${MAX_TOTAL_ATTACHMENT_CHARS} 字，请分批分析。`);
      totalChars += text.length;
      attachments.push({id:crypto.randomUUID(),name:file.name.slice(0,200),text,warnings});
    } catch (error) {
      errors.push(`${file.name}：${error instanceof Error?error.message:"读取失败，请重试。"}`);
    }
  }
  return {attachments,errors};
}
