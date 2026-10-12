import type { ProjectState, Proposal } from "./types";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_CHARS = 12000;
export const MAX_TOTAL_ATTACHMENT_CHARS = 40000;
export type MaterialInput = { name: string; text: string };
export type Attachment = MaterialInput & { id: string; warnings: string[] };
export class MaterialsInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function validateMaterials(value: unknown): MaterialInput[] {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS)
    throw new MaterialsInputError(`每次最多附加 ${MAX_ATTACHMENTS} 份材料。`);
  let total = 0;
  return value.map(item => {
    if (!item || typeof item !== "object" || typeof item.name !== "string" || typeof item.text !== "string" || item.name.length > 200)
      throw new MaterialsInputError("材料格式不正确，请重新选择文件。");
    if (!item.text.trim()) throw new MaterialsInputError("材料正文为空，请移除空文件。");
    if (item.text.length > MAX_ATTACHMENT_CHARS)
      throw new MaterialsInputError(`${item.name || "材料"} 超过 12000 字，请拆分文档。`, 413);
    total += item.text.length;
    if (total > MAX_TOTAL_ATTACHMENT_CHARS)
      throw new MaterialsInputError("本次材料正文合计超过 40000 字，请分批分析；未修改项目资料。", 413);
    return {name:item.name.split(/[\\/]/u).at(-1)!.replace(/[\u0000-\u001f]/gu, "").slice(0,200),text:item.text};
  });
}

export function prepareMaterials(state: ProjectState, inputs: MaterialInput[], kind: ProjectState["materials"][number]["kind"]) {
  const lastNumber = (state.materials || []).reduce((max, item) => {
    const number = /^M\d+$/iu.test(item.id) ? Number(item.id.slice(1)) : 0;
    return Number.isSafeInteger(number) && number > 0 ? Math.max(max, number) : max;
  }, 0);
  const at = new Date().toISOString();
  return inputs.map((input,index) => ({id:`M${String(lastNumber+index+1).padStart(2,"0")}`,content:input.text,name:input.name,at,kind}));
}

export function materialContext(materials: ProjectState["materials"]) {
  return materials.map(item =>
    `【用户材料 ${item.id}：${item.name || "未命名材料"}】\n${item.content}`
  ).join("\n\n");
}

// Bind every quotation to an actual document, never to the combined context's headings.
export function bindMaterialSources(proposal: Proposal, materials: ProjectState["materials"], messageId?: string) {
  const sourceFor = (quote: string, preferred?: string) => materials.find(item => item.id === preferred && item.content.includes(quote))
    || materials.find(item => quote.trim() && item.content.includes(quote));
  proposal.evidence = proposal.evidence.flatMap(item => {
    if ((messageId && item.source === messageId) || (item.source !== "当前材料" && !materials.some(material=>material.id===item.source))) return [item];
    const source = sourceFor(item.quote,item.source);
    return source ? [{...item,source:source.id}] : [];
  });
  for (const [key,meta] of Object.entries(proposal.fieldMeta || {})) {
    if (meta.sourceRef === "当前材料") meta.sourceRef = sourceFor(proposal.fields[key])?.id;
  }
  const refs = (values: string[]) => [...new Set(values.flatMap(ref => ref === "当前材料" ? materials.map(item => item.id) : [ref]))];
  for (const dimension of proposal.artifact?.diagnosis?.dimensions || []) {
    dimension.sourceRefs = refs(dimension.sourceRefs);
    if (dimension.scoreTriggerRefs) dimension.scoreTriggerRefs = refs(dimension.scoreTriggerRefs);
  }
  for (const canvasModule of proposal.artifact?.canvas?.modules || []) canvasModule.sourceRefs = refs(canvasModule.sourceRefs);
  if (proposal.artifact?.interview) {
    const interview = proposal.artifact.interview;
    interview.sourceId = materials.map(item => item.id).join("、");
    interview.quotes = interview.quotes.flatMap(item => {
      const source = sourceFor(item.quote,item.sourceId);
      return source ? [{...item,sourceId:source.id}] : [];
    });
  }
  if (proposal.artifact?.survey) proposal.artifact.survey.sourceId = materials.map(item => item.id).join("、");
  if (proposal.artifact?.funnel) proposal.artifact.funnel.sourceId = materials.map(item => item.id).join("、");
  if (proposal.artifact?.competition) proposal.artifact.competition.competitors = proposal.artifact.competition.competitors.filter(competitor =>
    competitor.sourceId !== "当前材料" || !!sourceFor(competitor.sourceQuote)
  );
  for (const competitor of proposal.artifact?.competition?.competitors || []) {
    if (competitor.sourceId === "当前材料") competitor.sourceId = sourceFor(competitor.sourceQuote)?.id || "";
    competitor.citations = (competitor.citations || []).filter(citation => citation.sourceId !== "当前材料" || !!sourceFor(citation.quote));
    for (const citation of competitor.citations) {
      if (citation.sourceId === "当前材料") citation.sourceId = sourceFor(citation.quote)?.id || "";
    }
  }
  if (proposal.artifact) proposal.artifact.sources.push(...materials.map(item => ({label:`用户材料 ${item.id}${item.name?` · ${item.name}`:""}`})));
}
