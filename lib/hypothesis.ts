import type { Hypothesis, HypothesisUpdate, ProjectState, Proposal } from "./types";

export const hypothesisStatePrompt = "更新当前假设与证据状态：结合已有项目资料、对话和证据，逐条复核现有假设的处理优先级（高／中／低）与下一步，说明调整或保留的依据；有可追溯的新证据时更新证据判断，证据不足时明确缺口。优先更新已有假设，仅在发现现有清单未覆盖的关键问题时增加必要的新假设，避免重复。";

export function isHypothesisStateRequest(message: string) {
  if (/(?:不要|不用|别|无需).{0,12}(?:更新|修改|整理|恢复|建立|写入|同步).{0,12}(?:假设|清单)/u.test(message)) return false;
  return /(?:更新|复核|整理|评估|调整).*(?:假设|清单).*(?:状态|优先级|优先顺序|高中低|高／中／低)/u.test(message)
    || /(?:恢复|建立|写入|同步).{0,24}(?:假设(?:清单)?|清单)|(?:假设(?:清单)?|清单).{0,24}(?:恢复|建立|写入|同步)/u.test(message)
    || (!/调研|访谈|问卷|MVP|证据/u.test(message) && /(?:更新|整理).{0,24}(?:假设清单|假设列表)|(?:假设清单|假设列表).{0,24}(?:更新|整理)/u.test(message));
}

// Short confirmations resolve only against the most recent proposed revision.
export function isHypothesisRevisionRequest(state: ProjectState, message: string) {
  if (/(?:不要|不用|无需|别|暂不).{0,12}(?:修订|修改|调整|改写|更新|同步)/u.test(message)) return false;
  const explicit = (/(?:修订|修改|调整|改写|改成|改为)/u.test(message)
    || /(?:更新|同步).{0,16}(?:表述|措辞|原文)|(?:表述|措辞|原文).{0,16}(?:更新|同步)/u.test(message))
    && /假设|\bH\d{1,3}\b/iu.test(message)
    && !/(?:优先级|证据状态|处理顺序)/u.test(message);
  if (explicit && !/可以吗|是否|怎么|如何|为什么|建议吗/u.test(message)) return true;
  if (!/^(?:确认|好的|好|可以|同意|就这样|按你说的(?:改|修改)?)[。！!\s]*$/u.test(message.trim())) return false;
  const last = state.messages.findLast(m => m.role === "assistant");
  return !!last && /假设|\bH\d{1,3}\b/iu.test(last.content)
    && /修订|修改|改成|改为|表述改|表述调整/u.test(last.content);
}

export function missingHypothesisRevision(state: ProjectState, candidate: Pick<Proposal, "reply" | "hypothesis" | "hypotheses">, required = false) {
  const changes = [candidate.hypothesis, ...(candidate.hypotheses || [])].filter((item): item is NonNullable<Proposal["hypothesis"]> => !!item);
  const revisions = changes.filter(item => item.targetId && state.hypotheses.some(h => h.id === item.targetId && h.text.trim() !== item.text.trim()));
  for (const item of changes) {
    if (item.targetId && !state.hypotheses.some(h => h.id === item.targetId)) return "修订对象必须是当前已有假设编号，不能创建重复假设";
  }
  if (required && state.hypotheses.length && !revisions.length) return "用户已要求或确认修订假设：必须在 hypothesis 中填写现有 targetId、完整新 text 和 changeKind，不能只修改 fields 或口头声称已更新";
  // A claim about a particular hypothesis must have a matching persisted edit.
  for (const sentence of candidate.reply.split(/[。！!？?\n]/u)) {
    if (!/(?:表述|措辞|原文|目标用户).{0,16}(?:已|也|随之).{0,8}(?:更新|修改|修订|调整)|(?:已|已经).{0,8}(?:将|把)?\s*H\d+.{0,20}(?:改为|改成|修改|修订|更新)/iu.test(sentence)) continue;
    const ids = sentence.match(/\bH\d{1,3}\b/giu) || [];
    if (ids.some(id => !revisions.some(item => item.targetId?.toUpperCase() === id.toUpperCase())) || (!ids.length && /假设/u.test(sentence) && !revisions.length))
      return "回复声称假设表述已更新，但缺少对应 targetId 的完整新表述；提交实际修订或删除不实的完成声明";
  }
  return null;
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
