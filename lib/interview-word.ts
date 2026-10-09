import { zipSync, strToU8 } from "fflate";
import type { Artifact } from "./types";

const wordNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const relNs = "http://schemas.openxmlformats.org/package/2006/relationships";

function xml(text: string) {
  // XML 1.0 cannot contain control characters; preserve all printable Unicode.
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu, "")
    .replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
}

function run(text: string, bold = false, code = false) {
  return `<w:r>${bold || code ? `<w:rPr>${bold ? "<w:b/>" : ""}${code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

function inline(text: string) {
  // Display Markdown links with their destinations, so the export loses no source.
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/gu, "$1（$2）");
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/gu);
  return parts.map(part => part.startsWith("**") && part.endsWith("**") ? run(part.slice(2, -2), true)
    : part.startsWith("`") && part.endsWith("`") ? run(part.slice(1, -1), false, true) : run(part)).join("");
}

function paragraph(text: string, style = "Normal", bullet = false) {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ""}</w:pPr>${inline(text)}</w:p>`;
}

function bodyParagraphs(content: string) {
  const output: string[] = [];
  for (const line of content.replace(/\r\n?/gu, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^(?:---+|\*\*\*+|___+|```.*)$/u.test(trimmed)) continue;
    const heading = /^(#{1,6})\s+(.+)$/u.exec(trimmed);
    const bullet = /^\s*[-*•]\s+(.+)$/u.exec(line);
    if (heading) output.push(paragraph(heading[2], heading[1].length <= 2 ? "Heading1" : "Heading2"));
    else if (bullet) output.push(paragraph(bullet[1], "Normal", true));
    else if (/^>\s?/u.test(trimmed)) output.push(paragraph(trimmed.replace(/^>\s?/u, ""), "Quote"));
    else output.push(paragraph(line));
  }
  return output.join("");
}

export function interviewWordFilename(artifact: Pick<Artifact, "title" | "version">) {
  const title = Array.from(artifact.title.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, " ").replace(/\s+/gu, " ").trim()).slice(0, 70).join("").replace(/[. ]+$/gu, "");
  return `访谈提纲-${title || "未命名"}-V${artifact.version}.docx`;
}

// Generate from the complete saved artifact, never from the collapsed preview.
export function createInterviewWord(artifact: Artifact): Uint8Array {
  const date = new Date(artifact.createdAt);
  const metadata = `分析成果 V${artifact.version}${Number.isNaN(date.getTime()) ? "" : ` · ${date.toISOString().slice(0, 10)}`}`;
  let body = paragraph(artifact.title, "Title") + paragraph(metadata, "Subtitle") + bodyParagraphs(artifact.content);
  if (artifact.interview) {
    body += paragraph("访谈原话", "Heading1");
    for (const quote of artifact.interview.quotes) {
      body += paragraph(`${quote.direction}${quote.sourceId ? ` · 来源 ${quote.sourceId}` : ""}${quote.hypothesisId ? ` · 关联 ${quote.hypothesisId}` : ""}`, "Heading2");
      body += paragraph(quote.quote, "Quote");
    }
    if (artifact.interview.limitations) body += paragraph(artifact.interview.limitations);
  }
  if (artifact.limitations) body += paragraph("当前限制", "Heading1") + bodyParagraphs(artifact.limitations);
  if (artifact.nextStep) body += paragraph("下一步", "Heading1") + bodyParagraphs(artifact.nextStep);
  if (artifact.sources.length) {
    body += paragraph("信息依据", "Heading1");
    for (const source of artifact.sources) {
      body += paragraph(source.label, "Heading2");
      if (source.detail) body += bodyParagraphs(source.detail);
      if (source.url) body += paragraph(source.url);
      if (source.date || source.retrievedAt) body += paragraph([source.date && `发布日期：${source.date}`, source.retrievedAt && `检索时间：${source.retrievedAt}`].filter(Boolean).join(" · "), "Subtitle");
    }
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${wordNs}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${wordNs}">
    <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="263F48"/><w:lang w:val="zh-CN" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="312" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="180"/></w:pPr><w:rPr><w:b/><w:color w:val="176C73"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="6D858D"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="176C73"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="87BCB8"/></w:pBdr></w:pPr></w:style>
  </w:styles>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8"?><w:numbering xmlns:w="${wordNs}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="360"/></w:tabs><w:ind w:left="360" w:hanging="240"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${["document", "styles", "numbering"].map(part => `<Override PartName="/word/${part}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${part === "document" ? "document.main" : part}+xml"/>`).join("")}</Types>`;
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(document),
    "word/styles.xml": strToU8(styles),
    "word/numbering.xml": strToU8(numbering),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`),
  });
}
