import { researchTextModes, type HypothesisAssessment, type ProjectState } from "./types";

// Only ignore layout whitespace; always save the actual contiguous source text.
function sourceExcerpt(content: string, excerpt: string): string | undefined {
  if (!excerpt.trim()) return undefined;
  if (content.includes(excerpt)) return excerpt;
  const positions: number[] = [];
  let compact = "";
  for (let i = 0; i < content.length; i++) {
    if (!/\s/u.test(content[i])) { compact += content[i]; positions.push(i); }
  }
  const needle = excerpt.replace(/\s/gu, "");
  const start = compact.indexOf(needle);
  if (!needle || start < 0) return undefined;
  return content.slice(positions[start], positions[start + needle.length - 1] + 1);
}

export function restoreAssessmentSourceText(state: ProjectState, assessments: HypothesisAssessment[]) {
  return assessments.map(assessment => ({...assessment, evidence: assessment.evidence.map(e => {
    const material = state.materials.find(m => m.id === e.source);
    if (!material) return {...e};
    return {...e, quote: sourceExcerpt(material.content, e.quote) ?? e.quote,
      subject: sourceExcerpt(material.content, e.subject) ?? e.subject};
  })}));
}

// A failed model retry should not discard unrelated, verifiable assessments.
// Never turn a paraphrase into a source quote: remove it and downgrade only its hypothesis.
export function omitUnverifiableAssessmentQuotes(state: ProjectState, assessments: HypothesisAssessment[]) {
  let omitted = 0;
  const safe = assessments.map(assessment => {
    const evidence = assessment.evidence.filter(item => {
      const material = state.materials.find(source => source.id === item.source);
      return !!material?.content.includes(item.quote);
    });
    const removed = assessment.evidence.length - evidence.length;
    if (!removed) return assessment;
    omitted += removed;
    const sources = [...new Set(assessment.evidence.filter(item => !evidence.includes(item)).map(item => item.source))].join("、");
    return {...assessment,evidence,evidenceStatus:"证据不足" as const,
      rationale:`已核对原始材料；${removed} 条模型引用无法逐字对应原文，未计入证据。其余可核验记录不足以确认这条假设。`,
      limitations:`${sources || "相关材料"} 有 ${removed} 条引用无法逐字核验，已剔除；仍需核对原文、样本身份及关键变量。`,
      nextStep:"核对相关原始材料，补充可逐字追溯的记录后重新评估。"};
  });
  return {assessments:safe,omitted};
}

// A model may describe a respondent instead of copying the identifier in the source.
// Keep the quote, but do not persist that description as a verified identity.
export function omitUnverifiedAssessmentSubjects(state: ProjectState, assessments: HypothesisAssessment[]) {
  return assessments.map(assessment => {
    const unverified = assessment.evidence.flatMap(e => {
      const subject = e.subject.trim();
      const material = state.materials.find(m => m.id === e.source);
      return subject && !material?.content.includes(e.subject) ? [subject] : [];
    });
    if (!unverified.length) return assessment;
    const evidence = assessment.evidence.map(e => {
      const material = state.materials.find(m => m.id === e.source);
      return {...e, subject: material?.content.includes(e.subject) ? e.subject : ""};
    });
    const replaceUnverified = (value: string) => unverified.reduce((text, subject) => text.replaceAll(subject, "身份未核实的对象"), value);
    const note = "部分对象标识无法在原始材料中核实，已留空；独立样本数量仍待确认。";
    let evidenceStatus = assessment.evidenceStatus;
    if (evidenceStatus === "初步支持") {
      const concrete = evidence.filter(e => e.level === "E2" && e.direction === "support");
      const otherResearch = concrete.some(e => {
        const material = state.materials.find(m => m.id === e.source);
        return material?.kind === "问卷数据" || material?.kind === "测试数据"
          || ((!material?.kind || material.kind === "其他") && researchTextModes(material?.name || material?.content || "").some(mode => mode !== "用户访谈"));
      });
      if (!(assessment.researchMethods?.length && otherResearch) && new Set(concrete.map(e => e.subject.trim()).filter(Boolean)).size < 2) evidenceStatus = "证据不足";
    }
    const rationale = replaceUnverified(assessment.rationale);
    return {...assessment,evidenceStatus,evidence:evidence.map(e => ({...e,relevance:replaceUnverified(e.relevance)})),
      rationale: evidenceStatus !== assessment.evidenceStatus ? `${rationale.slice(0, 750)} 独立受访者数量未核实，暂列证据不足。` : rationale,
      limitations:`${replaceUnverified(assessment.limitations).slice(0, 530)} ${note}`,
      nextStep:replaceUnverified(assessment.nextStep)};
  });
}

// Reject an entire review if any quote or version cannot be traced back.
export function validateHypothesisAssessments(state: ProjectState, assessments: HypothesisAssessment[]) {
  const seen = new Set<string>();
  for (const assessment of assessments) {
    const h = state.hypotheses.find(item => item.id === assessment.hypothesisId);
    if (!h || h.version !== assessment.hypothesisVersion || seen.has(h.id)) throw new Error("假设版本或评估对象不匹配；未修改项目资料。");
    seen.add(h.id);
    if (!assessment.rationale.trim() || !assessment.limitations.trim() || !assessment.nextStep.trim() || !assessment.sourceIds.length
      || assessment.sourceIds.some(id => !state.materials.some(m => m.id === id && m.content.trim())))
      throw new Error("假设评估缺少原始材料、判断依据或限制；未修改项目资料。");
    for (const e of assessment.evidence) {
      const material = state.materials.find(m => m.id === e.source);
      const context = `${h.id} 的 ${e.source} 引用`;
      if (!material || !assessment.sourceIds.includes(e.source))
        throw new Error(`${context}对应的材料编号不匹配；未修改项目资料。`);
      if (!e.quote.trim() || !material.content.includes(e.quote))
        throw new Error(`${context}「${e.quote.slice(0,80)}」未在原始材料中找到。请从该材料复制连续原话，不要改写或拼接；未修改项目资料。`);
      if (!e.relevance.trim())
        throw new Error(`${context}缺少与假设的关联说明；未修改项目资料。`);
      if (e.subject.trim() && !material.content.includes(e.subject))
        throw new Error(`${context}的对象或样本标识「${e.subject.slice(0,40)}」未在原文中找到。请使用原文标识，无法确认时留空；未修改项目资料。`);
    }
    if (/知识库|\bKB\d+[A-Z]?\b/iu.test([assessment.rationale,assessment.limitations,assessment.nextStep,...assessment.evidence.map(e=>e.relevance)].join("\n")))
      throw new Error("分析正文应直接说明依据、限制和下一步，不提及内部知识库名称或编号；未修改项目资料。");
    const concrete = assessment.evidence.filter(e => e.level === "E2");
    const hasOtherResearchSupport = concrete.some(e => {
      if (e.direction !== "support") return false;
      const material = state.materials.find(m => m.id === e.source)!;
      return material.kind === "问卷数据" || material.kind === "测试数据"
        || (!material.kind || material.kind === "其他") && researchTextModes(material.name || material.content).some(mode => mode !== "用户访谈");
    });
    if (assessment.evidenceStatus === "初步支持" && (!concrete.some(e => e.direction === "support") || (!(assessment.researchMethods?.length && hasOtherResearchSupport) && new Set(concrete.filter(e => e.direction === "support").map(e => e.subject.trim()).filter(Boolean)).size < 2)))
      throw new Error("初步支持须有多个受访者的具体经历；未修改项目资料。");
    if (assessment.evidenceStatus === "初步不支持" && !concrete.some(e => e.direction === "opposition"))
      throw new Error("初步不支持缺少可追溯的具体反向经历；未修改项目资料。");
    if (assessment.evidenceStatus === "证据不一致" && !(concrete.some(e => e.direction === "support") && concrete.some(e => e.direction === "opposition" || e.direction === "boundary")))
      throw new Error("证据不一致缺少不同方向的具体经历；未修改项目资料。");
  }
}

export function applyHypothesisAssessments(state: ProjectState, assessments: HypothesisAssessment[], at: string) {
  validateHypothesisAssessments(state, assessments);
  for (const assessment of assessments) {
    const h = state.hypotheses.find(item => item.id === assessment.hypothesisId)!;
    h.assessmentHistory ||= [];
    if (h.assessment) h.assessmentHistory.push(h.assessment);
    h.evidenceRecords ||= [];
    for (const e of assessment.evidence) {
      const material = state.materials.find(m => m.id === e.source)!;
      let record = h.evidenceRecords.find(r => r.hypothesisVersion === h.version && r.sourceId === e.source && r.quote === e.quote && r.direction === e.direction);
      if (!record) {
        record = {id:crypto.randomUUID(),hypothesisVersion:h.version,sourceId:e.source,quote:e.quote,direction:e.direction,sourceLocation:`字符 ${material.content.indexOf(e.quote)+1}`,recordedAt:at};
        h.evidenceRecords.push(record);
      }
      Object.assign(record, {level:e.level,relevance:e.relevance,subject:e.subject,limitations:assessment.limitations});
    }
    h.assessment = {...structuredClone(assessment),assessedAt:at};
    // Preliminary research reviews retain stronger completed validation judgments.
    if (!["得到支持", "部分支持", "暂未支持", "结果不一致"].includes(h.evidenceStatus)) h.evidenceStatus = assessment.evidenceStatus;
    h.nextStep = assessment.nextStep;
  }
}
