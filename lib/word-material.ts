import { Buffer } from "node:buffer";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { unzipSync } from "fflate";

export const MAX_WORD_BYTES = 5 * 1024 * 1024;
export const MAX_MATERIAL_CHARS = 12000;
export class MaterialError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

function checkDocxArchive(bytes: Uint8Array) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new MaterialError("DOCX 文件无法读取；若文档加密，请取消密码后重新上传。", 415);
  let expanded = 0, count = 0, hasDocument = false;
  // Inspect the ZIP directory without decompressing any entry before passing it to the Word parser.
  unzipSync(bytes, { filter(entry) {
    expanded += entry.originalSize;
    count++;
    if (count > 1000 || expanded > 25 * 1024 * 1024 || !Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0)
      throw new MaterialError("Word 文档解压后过大或包含过多内容，请只保留需要分析的正文后重试。", 413);
    if (entry.name.endsWith(".xml") && entry.originalSize > 2 * 1024 * 1024)
      throw new MaterialError("Word 文档结构过大，请拆分为较小的文档后重试。", 413);
    if (entry.name === "word/document.xml") hasDocument = true;
    return false;
  } });
  if (!hasDocument) throw new MaterialError("文件不包含 Word 正文，请上传有效的 .docx 文档。", 415);
}

export async function extractWordMaterial(file: Pick<File, "name" | "size" | "arrayBuffer">): Promise<{text:string;name:string;warnings:string[]}> {
  const extension = file.name.toLowerCase().match(/\.(docx|doc)$/u)?.[1];
  if (!extension) throw new MaterialError("请上传 .docx 或 .doc 格式的 Word 文档。", 415);
  if (!file.size) throw new MaterialError("文件为空，请重新选择 Word 文档。", 400);
  if (file.size > MAX_WORD_BYTES) throw new MaterialError("Word 文件超过 5 MB，请拆分或移除较大的图片后重试。", 413);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_WORD_BYTES) throw new MaterialError("Word 文件超过 5 MB。", 413);
    let text: string;
    const warnings = ["已提取 Word 正文；图片、扫描内容、页眉页脚、批注和版式未作为分析材料。请在发送前核对提取内容。"];
    if (extension === "docx") {
      checkDocxArchive(bytes);
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = result.value;
      if (result.messages.length) warnings.push("文档中有部分结构无法完整解析，请核对预览；必要时在 Word 中另存为新的 DOCX 再上传。");
    } else {
      const signature = [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
      if (!signature.every((byte,index)=>bytes[index]===byte)) throw new MaterialError("该文件不是有效的旧版 DOC 文档，请在 Word 中另存为 .docx 后上传。", 415);
      const doc = await new WordExtractor().extract(Buffer.from(bytes));
      text = doc.getBody();
    }
    text = text.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").replace(/\u0000/gu, "").trim();
    if (!text) throw new MaterialError("没有提取到可读正文。若是扫描图片，请先在 Word 中转成可选中的文字再上传。");
    if (text.length > MAX_MATERIAL_CHARS) throw new MaterialError(`提取的正文有 ${text.length} 字，超过 12000 字；请拆分文档后分次上传，本次未附加材料。`, 413);
    return { text, name:file.name.split(/[\\/]/u).at(-1)!.replace(/[\u0000-\u001f]/gu, "").slice(0,200), warnings };
  } catch (error) {
    if (error instanceof MaterialError) throw error;
    throw new MaterialError("Word 文档无法解析，可能已损坏、加密或格式不兼容。请在 Word 中另存为 .docx 后重试。");
  }
}
