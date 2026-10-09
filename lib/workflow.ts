import { sectionLabels, type Section } from "./types";

export type ConversationPlan = {
  section: Section;
  kind: "discussion" | "answer" | "artifact" | "materialAnalysis" | "webResearch";
  label: string;
  createArtifact: boolean;
};

const action = /生成|整理|更新|制作|制定|设计|编写|拟定|输出|拆出|分析|评估|诊断|做(?:一份|一张|一个)/u;
const targets: [Section, RegExp][] = [
  ["canvas", /商业模式画布|商业画布|九格画布|画布/u],
  ["diagnosis", /八维|诊断|评估.*(?:项目|创业|想法)|(?:项目|创业|想法).*评估/u],
  ["competitors", /竞品|竞争对手|替代产品|类似产品/u],
  ["hypotheses", /假设|可证伪/u],
  ["research", /访谈|采访|问卷|招募|提纲|MVP|原型|漏斗|验证任务卡|实验|测试数据/iu],
];

function actionableClauses(message: string) {
  return message.split(/[，,。；;\n]/u).filter(clause => {
    if (!action.test(clause)) return false;
    if (/(?:不要|不用|无需|别|暂不|暂时不)\s*(?:再|帮我|给我)?\s*(?:生成|整理|更新|制作|制定|设计|编写|拟定|输出|分析|评估|诊断)/u.test(clause)) return false;
    // Asking how to perform a task is still a question, unless execution is explicit.
    if (/解释|介绍|什么是|是什么意思|有什么区别|原理|为什么|如何|怎么/u.test(clause)
      && !/(?:帮我|给我|请你|请帮我)\s*(?:生成|整理|更新|制作|制定|设计|编写|拟定|输出|分析|评估|诊断)/u.test(clause)) return false;
    return true;
  });
}

// Route explicit tasks; ambiguous requests keep their current conversational context.
export function planConversation(section: Section, message: string, referenceText = "", manualSearch = false): ConversationPlan {
  if (manualSearch) return { section: "competitors", kind: "webResearch", label: "联网竞品研究", createArtifact: true };
  const clauses = actionableClauses(message);
  const target = targets.find(([, pattern]) => clauses.some(clause => pattern.test(clause)))?.[0];
  if (target) return { section: target, kind: "artifact", label: `${sectionLabels[target]}任务`, createArtifact: true };
  if (referenceText) return { section, kind: "materialAnalysis", label: "材料解读", createArtifact: clauses.length > 0 };
  if (/改为|改成|修改为|补充|记录为|删除|移除|(?:我|我们)(?:想做|打算做|计划做|希望做|觉得)|(?:项目|产品)(?:是|叫)|目标用户(?:是|为)/u.test(message))
    return { section, kind: "discussion", label: "项目讨论", createArtifact: false };
  if (/什么是|是什么意思|区别|原理|有哪些|有什么|怎么|如何|解释|介绍|吗[？?]?$/u.test(message))
    return { section, kind: "answer", label: "问题解答", createArtifact: false };
  return { section, kind: "discussion", label: "项目讨论", createArtifact: false };
}

export function cleanSuggestedQuestions(questions: string[]) {
  return [...new Set(questions.map(question => question.trim()).filter(question => question.length > 1 && question.length <= 90))].slice(0, 3);
}
