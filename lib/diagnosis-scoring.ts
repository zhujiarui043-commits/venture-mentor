import { isDiagnosisScore, type DiagnosisDimension, type ProjectState } from "./types";

// Scores describe the available information and evidence, independently of attention.
export function groundDiagnosisScore(
  dimension: DiagnosisDimension,
  state: ProjectState,
  fields: Record<string, string>,
  referenceText: string,
  sourceMessageId: string | undefined,
  scoredAt: string,
): DiagnosisDimension {
  const artifactFor = (ref: string) => state.artifacts.find(a => a.id === ref || a.recordId === ref);
  const validSource = (ref: string) => !!(fields[ref]?.trim() || state.fields[ref]?.trim()
    || state.materials.some(m => m.id === ref && m.content.trim())
    || state.messages.some(m => m.id === ref && m.role === "user" && m.content.trim())
    || (sourceMessageId && ref === sourceMessageId) || (ref === "当前材料" && referenceText.trim())
    || artifactFor(ref));
  const sourceRefs = [...new Set(dimension.sourceRefs.filter(validSource))];
  const hypothesisRefs = [...new Set(dimension.hypothesisRefs.filter(ref => state.hypotheses.some(h => h.id === ref)))];
  const supported = sourceRefs.length > 0 || hypothesisRefs.length > 0;
  const prior = [...state.artifacts].reverse().find(a => a.diagnosis)?.diagnosis?.dimensions.find(d => d.name === dimension.name);
  const freshSource = (ref: string) => {
    if (!validSource(ref)) return false;
    if (!prior?.scoreUpdatedAt) return true;
    if (ref === sourceMessageId || (ref === "当前材料" && referenceText.trim())
      || (ref in fields && fields[ref].trim() !== state.fields[ref]?.trim())) return true;
    const updatedAt = state.fieldMeta?.[ref]?.updatedAt
      || state.materials.find(m => m.id === ref)?.at
      || state.messages.find(m => m.id === ref)?.at || artifactFor(ref)?.createdAt;
    return !!updatedAt && Date.parse(updatedAt) > Date.parse(prior.scoreUpdatedAt);
  };
  const scoreTriggerRefs = [...new Set((dimension.scoreTriggerRefs || []).filter(ref => sourceRefs.includes(ref) && freshSource(ref)))];
  let score = supported && isDiagnosisScore(dimension.score) ? dimension.score : 0;
  let scoreReason = !supported ? "缺少形成该维度判断的关键信息，暂无法判断。" : dimension.scoreReason?.trim().slice(0, 500) || "评分依据尚待补充。";
  let scoreConfidence = !supported ? "低" : dimension.scoreConfidence || "低";
  const evidenceSource = (ref: string) => {
    if (ref === "当前材料") return !!referenceText.trim();
    if (state.materials.some(m => m.id === ref && m.content.trim())) return true;
    const fieldSource = state.fieldMeta?.[ref]?.sourceRef;
    if (fieldSource && state.materials.some(m => m.id === fieldSource && m.content.trim())) return true;
    const artifact = artifactFor(ref);
    const materialRefs = [artifact?.interview?.sourceId, artifact?.survey?.sourceId, artifact?.funnel?.sourceId]
      .flatMap(ref => ref?.split("、") || []);
    return !!(artifact?.competition?.competitors.some(c => c.sourceQuote && (c.sourceUrl || c.citations?.length))
      || materialRefs.some(ref => state.materials.some(m => m.id === ref)));
  };
  const hasEvidence = sourceRefs.some(evidenceSource) || hypothesisRefs.some(ref => state.hypotheses.find(h => h.id === ref)?.evidenceRecords?.some(e =>
    state.materials.some(m => m.id === e.sourceId && m.content.includes(e.quote))));
  const hasUserStatement = sourceRefs.some(ref => ref === sourceMessageId
    || state.messages.some(m => m.id === ref && m.role === "user")
    || state.messages.some(m => m.id === state.fieldMeta?.[ref]?.sourceRef && m.role === "user"));
  if (score >= 3 && !hasEvidence) {
    if (!hasUserStatement) {
      score = 2; scoreConfidence = "低";
      scoreReason = "当前依据仅为项目表述或假设，尚缺少可追溯的访谈、问卷、竞品或行为材料，按 2 分记录。";
    } else if (score === 4) {
      score = 3; scoreConfidence = "低";
      scoreReason = "当前依据为可追溯的用户陈述，尚缺少该维度 4 分所需的实际验证材料，最多按 3 分记录。";
    }
  }
  // Re-running a diagnosis does not itself constitute new evidence for a change.
  const retainPrior = isDiagnosisScore(prior?.score) && score !== prior.score && !scoreTriggerRefs.length;
  if (retainPrior) {
    score = prior!.score!; scoreReason = prior!.scoreReason || "沿用上次评分，尚无新的触发依据。";
    scoreConfidence = prior!.scoreConfidence || "低";
  }
  return {
    ...dimension, sourceRefs, hypothesisRefs,
    attention: supported ? dimension.attention : "信息待补充",
    score, scoreReason, scoreConfidence, scoreTriggerRefs,
    scoreUpdatedAt: isDiagnosisScore(prior?.score) && (retainPrior || (score === prior.score && !scoreTriggerRefs.length)) ? prior.scoreUpdatedAt || scoredAt : scoredAt,
    limitations: [dimension.limitations.slice(0, 320), retainPrior ? "未提供新增信息或证据触发来源，保留上次评分。" : ""].filter(Boolean).join("；"),
  };
}
