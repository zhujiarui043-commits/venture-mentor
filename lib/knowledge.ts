import rules from "@/knowledge/rules.json";
import type { ProjectState, Section } from "./types";

type KnowledgeTask = Exclude<Section, "research"> | "interview" | "surveyDesign" | "surveyAnalysis" | "mvpDesign" | "mvpAnalysis";
type RuleRef = readonly [kb: string, indices: readonly number[]];

// These indices refer to the numbered sections of the original knowledge documents.
// Put the task's decision rules before examples so short prompts still retrieve useful rules.
const taskRules: Record<KnowledgeTask, readonly RuleRef[]> = {
  overview: [["KB01", [4, 5, 2, 3, 7]], ["KB02", [1, 3, 8]], ["KB03", [1, 5, 6]]],
  diagnosis: [["KB04S", [0, 1, 2, 3]], ["KB04", [5, 3, 4, 7]], ["KB05", [4, 6]], ["KB03", [3, 5]]],
  competitors: [["KB11", [5, 7, 8, 4, 3, 10]], ["KB05", [6]]],
  hypotheses: [["KB05", [3, 6, 7, 4, 2, 9]], ["KB01", [4]]],
  interview: [["KB07", [8, 2, 4, 7, 1, 9]], ["KB05", [6]]],
  surveyDesign: [["KB08", [1, 2, 4, 5, 3, 11]], ["KB05", [6]]],
  surveyAnalysis: [["KB08", [7, 8, 9, 10, 11]], ["KB05", [6]]],
  mvpDesign: [["KB09", [7, 6, 2, 1, 8, 12]], ["KB05", [6]]],
  mvpAnalysis: [["KB14", [3, 4, 5, 9, 2, 13]], ["KB09", [9]], ["KB05", [6]]],
  canvas: [["KB10", [3, 4, 2, 5, 6, 9, 10]], ["KB05", [6]]],
};

export function resolveKnowledgeTask(section: Section, message: string, referenceText = ""): KnowledgeTask {
  if (section !== "research") return section;
  const survey = /问卷|调查|量表|样本|答卷/u.test(message);
  const market = /MVP|原型|市场测试|漏斗|转化率|留存|(?:验证|测试)任务卡|实验/iu.test(message);
  const analysis = /分析|结果|回收|数据|统计|指标|计算|清洗|复盘/u.test(message);
  if (survey) {
    if (/设计|生成.*问卷|编写题目|拟定题目/u.test(message) && !analysis) return "surveyDesign";
    return analysis || (referenceText && /[,\t].*\n/u.test(referenceText)) ? "surveyAnalysis" : "surveyDesign";
  }
  if (market) return analysis && !/设计|制定|生成.*任务卡/u.test(message) ? "mvpAnalysis" : "mvpDesign";
  if (/访谈|采访|招募|提纲/u.test(message)) return "interview";
  if (referenceText && /[,\t].*\n/u.test(referenceText)) return "surveyAnalysis";
  return "interview";
}

export function selectKnowledge(section: Section, message: string, state: ProjectState, referenceText = "") {
  const task = resolveKnowledgeTask(section, message, referenceText);
  const all = rules as Record<string, { title: string; text: string }[]>;
  const terms = `${message} ${state.fields.audience || ""} ${state.fields.problem || ""}`.match(/[\u4e00-\u9fa5]{2,4}|[a-zA-Z]{4,}/g) || [];
  const selected: string[] = [];
  let remaining = 19000;
  for (const [kb, indices] of taskRules[task]) {
    let kbRemaining = kb === taskRules[task][0][0] ? 10500 : 4500;
    const chunks = all[kb] || [];
    // Keep essential task sections in the listed order, then add one topic match if space remains.
    const extras = chunks.map((chunk, i) => ({ i, score: terms.reduce((n, term) => n + (chunk.title.includes(term) ? 3 : chunk.text.includes(term) ? 1 : 0), 0) }))
      .filter(item => item.score > 0 && !indices.includes(item.i)).sort((a, b) => b.score - a.score).slice(0, 1).map(item => item.i);
    for (const index of [...indices, ...extras]) {
      const chunk = chunks[index];
      if (!chunk || remaining < 350 || kbRemaining < 350) continue;
      const header = `${kb} ${chunk.title}\n`;
      const excerpt = chunk.text.slice(0, Math.min(2800, remaining - header.length - 2, kbRemaining - header.length - 2));
      if (excerpt.length < 200 && kb !== "KB04S") continue;
      selected.push(header + excerpt);
      remaining -= header.length + excerpt.length + 2;
      kbRemaining -= header.length + excerpt.length + 2;
    }
  }
  return { task, text: selected.join("\n\n") };
}
