import { canvasNames, diagnosisNames, type Section } from "./types";
import { planConversation } from "./workflow";

type StructuredArtifact = {
  title?: string;
  content?: string;
  diagnosis?: { dimensions: { name: string }[] };
  canvas?: { modules: { name: string }[] };
  competition?: { scope: string; competitors: unknown[]; unknowns: string[] };
  mvp?: { goal: string; method: string; target: string; steps: string[]; metrics: { name: string; numerator: string; denominator: string; window: string }[]; threshold: string; stopCondition: string };
} | null;

export function missingRequiredStructure(section: Section, task: string, message: string, artifact: StructuredArtifact, requireCompetition = false, createArtifact?: boolean): string | null {
  if (requireCompetition) return artifact?.competition ? null : "含来源的竞品比较";
  if (!(createArtifact ?? planConversation(section, message).createArtifact)) return null;
  if (section === "research" && task === "interview")
    return artifact?.title?.trim() && artifact.content?.trim() ? null : "可保存的访谈成果（标题和完整正文）";
  if (section === "diagnosis" && /诊断|评估|生成|整理|更新.*判断/u.test(message)) {
    const names = artifact?.diagnosis?.dimensions.map(d => d.name) || [];
    return diagnosisNames.length === names.length && diagnosisNames.every(name => names.includes(name)) ? null : "完整的八维诊断";
  }
  if (section === "canvas" && /画布|商业模式|九格|生成|整理/u.test(message)) {
    const names = artifact?.canvas?.modules.map(m => m.name) || [];
    return canvasNames.length === names.length && canvasNames.every(name => names.includes(name)) ? null : "完整的九格商业画布";
  }
  if (task === "mvpDesign" && /任务卡|设计.*MVP|MVP.*方案|制定.*验证|生成.*验证/u.test(message)) {
    const card = artifact?.mvp;
    return card && [card.goal, card.method, card.target, card.threshold, card.stopCondition].every(x => x.trim())
      && card.steps.length > 0 && card.metrics.length > 0
      && card.metrics.every(m => [m.name, m.numerator, m.denominator, m.window].every(x => x.trim())) ? null : "含指标口径的 MVP 验证任务卡";
  }
  return null;
}
