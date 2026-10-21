import { strFromU8, unzipSync } from "fflate";
import { MaterialError } from "./word-material";

import { MAX_ATTACHMENT_CHARS, MAX_STRUCTURED_FILE_BYTES } from "./materials";

export const MAX_EXCEL_BYTES = MAX_STRUCTURED_FILE_BYTES;
const MAX_EXCEL_EXPANDED_BYTES = 30 * 1024 * 1024;
const MAX_EXCEL_XML_BYTES = 12 * 1024 * 1024;
const MAX_EXCEL_ENTRIES = 2000;
const MAX_EXCEL_ROWS = 1001;
const MAX_EXCEL_COLUMNS = 100;
const MAX_EXCEL_CHARS = MAX_ATTACHMENT_CHARS;

type SheetResult = { name: string; rows: string[][]; cellCount: number; truncated: boolean };

function cleanName(name: string) {
  return name.split(/[\\/]/u).at(-1)!.replace(/[\u0000-\u001f]/gu, "").slice(0, 200);
}

function decodeXml(value: string) {
  return value.replace(/&(?:#(x[\da-f]+|\d+)|lt|gt|quot|apos|amp);/giu, entity => {
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return '"';
    if (entity === "&apos;") return "'";
    if (entity === "&amp;") return "&";
    const raw = entity.slice(2, -1);
    const codePoint = raw[0]?.toLowerCase() === "x" ? Number.parseInt(raw.slice(1), 16) : Number.parseInt(raw, 10);
    return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
  });
}

function attribute(source: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = source.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "iu"));
  return match ? decodeXml(match[1] ?? match[2] ?? "") : undefined;
}

function textNodes(xml: string) {
  return [...xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/giu)].map(match => decodeXml(match[1])).join("");
}

function archivePath(base: string, target: string) {
  const parts = (target.startsWith("/") ? target.slice(1) : `${base}/${target}`).split("/");
  const result: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") result.pop();
    else result.push(part);
  }
  return result.join("/");
}

function inspectArchive(bytes: Uint8Array) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new MaterialError("Excel 文件无法读取；若工作簿加密，请取消密码后重新上传。", 415);
  let expanded = 0, count = 0, hasWorkbook = false;
  unzipSync(bytes, { filter(entry) {
    expanded += entry.originalSize;
    count++;
    if (count > MAX_EXCEL_ENTRIES || expanded > MAX_EXCEL_EXPANDED_BYTES || !Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0)
      throw new MaterialError("Excel 文件解压后过大或包含过多内容，请只保留需要分析的工作表后重试。", 413);
    if (/\.(?:xml|rels)$/iu.test(entry.name) && entry.originalSize > MAX_EXCEL_XML_BYTES)
      throw new MaterialError("Excel 工作表过大，请拆分数据后重试。", 413);
    if (entry.name === "xl/workbook.xml") hasWorkbook = true;
    return false;
  } });
  if (!hasWorkbook) throw new MaterialError("文件不包含有效的 Excel 工作簿，请上传 .xlsx 文件。", 415);
}

function workbookParts(files: Record<string, Uint8Array>) {
  const workbook = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  const rels = files["xl/_rels/workbook.xml.rels"] ? strFromU8(files["xl/_rels/workbook.xml.rels"]) : "";
  const relationTargets = new Map<string, string>();
  for (const match of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?\s*>/giu)) {
    const id = attribute(match[1], "Id"), target = attribute(match[1], "Target");
    if (id && target) relationTargets.set(id, archivePath("xl", target));
  }
  const sheets: {name:string;path:string}[] = [];
  for (const match of workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?\s*>/giu)) {
    const id = attribute(match[1], "r:id"), name = attribute(match[1], "name") || `工作表 ${sheets.length + 1}`;
    const path = id ? relationTargets.get(id) : undefined;
    if (path) sheets.push({name,path});
  }
  return { workbook, sheets };
}

function sharedStrings(files: Record<string, Uint8Array>) {
  const xml = files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : "";
  return [...xml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/giu)].map(match => textNodes(match[1]));
}

function dateStyles(files: Record<string, Uint8Array>) {
  const xml = files["xl/styles.xml"] ? strFromU8(files["xl/styles.xml"]) : "";
  const custom = new Map<number, string>();
  for (const match of xml.matchAll(/<(?:\w+:)?numFmt\b([^>]*)\/?\s*>/giu)) {
    const id = Number(attribute(match[1], "numFmtId")), code = attribute(match[1], "formatCode");
    if (Number.isSafeInteger(id) && code) custom.set(id, code);
  }
  const cellXfs = xml.match(/<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/iu)?.[1] || "";
  const builtIn = new Set([14,15,16,17,18,19,20,21,22,27,28,29,30,31,32,33,34,35,36,45,46,47,50,51,52,53,54,55,56,57,58]);
  return [...cellXfs.matchAll(/<(?:\w+:)?xf\b([^>]*)\/?\s*>/giu)].map(match => {
    const id = Number(attribute(match[1], "numFmtId") || 0);
    const normalized = (custom.get(id) || "").replace(/"[^"]*"|\[[^\]]*\]|\\./gu, "").toLowerCase();
    return builtIn.has(id) || (/[yd]/u.test(normalized) && /[ymdhis]/u.test(normalized));
  });
}

function excelDate(value: string, date1904: boolean) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return value;
  const epoch = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30);
  const date = new Date(epoch + serial * 86400000);
  if (Number.isNaN(date.getTime())) return value;
  return serial % 1 ? date.toISOString().replace(/\.000Z$/u, "Z") : date.toISOString().slice(0, 10);
}

function columnIndex(reference?: string) {
  const letters = reference?.match(/^[A-Z]+/iu)?.[0].toUpperCase();
  if (!letters) return -1;
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function parseSheet(name: string, xml: string, strings: string[], styles: boolean[], date1904: boolean): SheetResult {
  const rows: string[][] = [];
  let cellCount = 0, truncated = false;
  for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/giu)) {
    if (rows.length >= MAX_EXCEL_ROWS) { truncated = true; break; }
    const row: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/giu)) {
      const attrs = cellMatch[1], body = cellMatch[2];
      const index = columnIndex(attribute(attrs, "r"));
      if (index < 0 || index >= MAX_EXCEL_COLUMNS) { truncated = true; continue; }
      const type = attribute(attrs, "t") || "n";
      const raw = body.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/iu)?.[1];
      let value = "";
      if (type === "inlineStr") value = textNodes(body);
      else if (raw !== undefined) {
        const decoded = decodeXml(raw);
        if (type === "s") value = strings[Number(decoded)] ?? decoded;
        else if (type === "b") value = decoded === "1" ? "TRUE" : "FALSE";
        else if (type === "e") value = `#${decoded}`;
        else {
          const style = Number(attribute(attrs, "s") || 0);
          value = styles[style] ? excelDate(decoded, date1904) : decoded;
        }
      } else {
        const formula = body.match(/<(?:\w+:)?f\b[^>]*>([\s\S]*?)<\/(?:\w+:)?f>/iu)?.[1];
        if (formula) value = `=${decodeXml(formula)}`;
      }
      row[index] = value.replace(/\u0000/gu, "").trim();
      cellCount++;
    }
    while (row.length && !row.at(-1)) row.pop();
    if (row.some(value => value)) rows.push(Array.from({length:row.length},(_,index)=>row[index] || ""));
  }
  return {name,rows,cellCount,truncated};
}

function csvCell(value: string) {
  return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

function sheetCsv(sheet: SheetResult) {
  const width = Math.max(...sheet.rows.map(row => row.length));
  return sheet.rows.map(row => Array.from({length:width},(_,index)=>csvCell(row[index] || "")).join(",")).join("\n");
}

export async function extractExcelMaterial(file: Pick<File, "name" | "size" | "arrayBuffer">): Promise<{text:string;name:string;warnings:string[]}> {
  const extension = file.name.toLowerCase().match(/\.(xlsx|xls)$/u)?.[1];
  if (extension === "xls") throw new MaterialError("旧版 .xls 暂无法安全解析，请在 Excel 中另存为 .xlsx 后上传。", 415);
  if (extension !== "xlsx") throw new MaterialError("请上传 .xlsx 格式的 Excel 工作簿。", 415);
  if (!file.size) throw new MaterialError("文件为空，请重新选择 Excel 工作簿。", 400);
  if (file.size > MAX_EXCEL_BYTES) throw new MaterialError("Excel 文件超过 20 MB，请只保留需要分析的问卷结果后重试。", 413);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_EXCEL_BYTES) throw new MaterialError("Excel 文件超过 20 MB。", 413);
    inspectArchive(bytes);
    const files = unzipSync(bytes, {filter:entry=>/^(?:\[Content_Types\]\.xml|_rels\/\.rels|xl\/.*\.(?:xml|rels))$/iu.test(entry.name)});
    const {workbook,sheets} = workbookParts(files);
    if (!sheets.length) throw new MaterialError("Excel 工作簿中没有可读取的工作表。");
    const strings = sharedStrings(files), styles = dateStyles(files);
    const date1904 = /<(?:\w+:)?workbookPr\b[^>]*\bdate1904\s*=\s*(?:"(?:1|true)"|'(?:1|true)')/iu.test(workbook);
    const parsed = sheets.flatMap(sheet => files[sheet.path]
      ? [parseSheet(sheet.name,strFromU8(files[sheet.path]),strings,styles,date1904)] : []
    ).filter(sheet => sheet.rows.length && sheet.cellCount);
    if (!parsed.length) throw new MaterialError("Excel 工作簿中没有可读取的表格数据。");
    parsed.sort((a,b)=>b.cellCount-a.cellCount);
    const selected = parsed[0], text = sheetCsv(selected).trim();
    if (text.length > MAX_EXCEL_CHARS)
      throw new MaterialError(`工作表“${selected.name}”转换后有 ${text.length} 字，超过 ${MAX_EXCEL_CHARS} 字；请删除无关列或拆分数据后分次上传。`, 413);
    const warnings = [`已读取工作表“${selected.name}”，并转换为表格文本；公式优先使用文件中保存的计算结果，请在发送前核对预览。`];
    if (parsed.length > 1) warnings.push(`工作簿共有 ${parsed.length} 个非空工作表，本次选取数据量最大的“${selected.name}”；如需分析其他工作表，请单独保存后上传。`);
    if (selected.truncated) warnings.push(`仅读取前 ${MAX_EXCEL_ROWS} 行、${MAX_EXCEL_COLUMNS} 列，请缩小数据范围后重新上传以获得完整分析。`);
    return {text,name:cleanName(file.name),warnings};
  } catch (error) {
    if (error instanceof MaterialError) throw error;
    throw new MaterialError("Excel 工作簿无法解析，可能已损坏、加密或格式不兼容。请在 Excel 中另存为新的 .xlsx 后重试。");
  }
}
