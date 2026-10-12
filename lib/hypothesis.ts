import type { Hypothesis, HypothesisUpdate, ProjectState, Proposal } from "./types";

export const hypothesisStatePrompt = "更新当前假设与证据状态：结合已有项目资料、对话和证据，逐条复核现有假设的处理优先级（高／中／低）与下一步，说明调整或保留的依据；有可追溯的新证据时更新证据判断，证据不足时明确缺口。优先更新已有假设，仅在发现现有清单未覆盖的关键问题时增加必要的新假设，避免重复。";

export function isHypothesisStateRequest(message: string) {
  return /(?:更新|复核|整理|评估|调整).*(?:假设|清单).*(?:状态|优先级|优先顺序|高中低|高／中／低)/u.test(message);
}

export function validateHypothesisUpdates(state: ProjectState, updates: HypothesisUpdate[], requireAll = false) {
  const seen = new Set<string>();
  for (const update of updates) {
    const h = state.hypotheses.find(h => h.id === update.hypothesisId);
    if (!h || h.version !== update.hypothesisVersion || seen.has(h.id)) throw new Error("假设优先级更新的对象或版本不匹配");
    if (!["高", "中", "低"].includes(update.priority) || !update.rationale.trim() || !update.nextStep.trim()) throw new Error("假设优先级更新缺少高中低、判断依据或下一步");
    seen.add(h.id);
  }
  if (requireAll && state.hypotheses.some(h => !seen.has(h.id))) throw new Error("未逐条复核全部已有假设的处理优先级");
}

export function isSubstantiveRevision(target: Hypothesis, change: NonNullable<Proposal["hypothesis"]>) {
  return target.category !== change.category || (target.text.trim() !== change.text.trim() && change.changeKind !== "措辞调整");
}

export function evidenceVersionTarget(target: Hypothesis, change: Proposal["hypothesis"], requested?: "current" | "revised"): "current" | "revised" {
  return requested === "revised" && change?.targetId === target.id && isSubstantiveRevision(target, change) ? "revised" : "current";
}

export function attachEvidenceToVersion(h: Hypothesis, item: Proposal["evidence"][number], material: ProjectState["materials"][number], at: string, oldVersion?: number) {
  if (!material.content.includes(item.quote) || (item.hypothesisVersion !== undefined && item.hypothesisVersion !== (oldVersion ?? h.version))) return false;
  const useRevised = item.versionTarget === "revised" && oldVersion !== undefined;
  const version = oldVersion !== undefined && !useRevised ? oldVersion : h.version;
  const records = oldVersion !== undefined && !useRevised
    ? h.history.findLast(entry => entry.version === oldVersion)
    : h;
  if (!records) return false;
  records.evidenceRecords ||= [];
  if (records.evidenceRecords.some(record => record.sourceId === item.source && record.quote === item.quote && record.direction === item.direction && record.hypothesisVersion === version)) return false;
  records.evidenceRecords.push({
    id:crypto.randomUUID(), hypothesisVersion:version, direction:item.direction, quote:item.quote,
    sourceId:item.source, sourceLocation:`字符 ${material.content.indexOf(item.quote)+1}`, recordedAt:at,
  });
  if (records === h) h.evidenceStatus = "已有材料待评估";
  if (records === h && h.assessment) { h.assessmentHistory ||= []; h.assessmentHistory.push(h.assessment); delete h.assessment; }
  return true;
}
