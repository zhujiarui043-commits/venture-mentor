import { currentCompetition } from "./competition-workspace";
import { sectionLabels, type Competitor, type CompetitorCitation, type ProjectState, type Section } from "./types";

export type ConversationPlan = {
  section: Section;
  kind: "discussion" | "answer" | "artifact" | "materialAnalysis" | "webResearch";
  label: string;
  createArtifact: boolean;
};

const revision = /修改|改写|修订|调整|完善|优化|重写|迭代|改成|改为|替换|添加|增加|删除|删掉|补充/u;
const competitorEdit = /修改|改写|修订|调整|完善|优化|重写|更新|删除|删掉|移除|去掉|改成|改为|替换|补充|添加|增加|只保留|仅保留/u;
const action = /生成|整理|总结|判断|比较|检查|核对|更新|制作|制定|设计|编写|拟定|输出|拆出|分析|评估|评分|打分|诊断|修改|改写|修订|调整|完善|优化|重写|迭代|删除|删掉|移除|去掉|改成|改为|替换|补充|添加|增加|只保留|仅保留|做(?:一份|一张|一个)/u;
const targets: [Section, RegExp][] = [
  ["canvas", /商业模式画布|商业画布|九格画布|画布/u],
  ["diagnosis", /八维|雷达图|诊断|评估.*(?:项目|创业|想法)|(?:项目|创业|想法).*评估/u],
  ["competitors", /竞品|竞争对手|替代产品|类似产品/u],
  ["hypotheses", /假设|可证伪/u],
  ["research", /访谈|采访|问卷|招募|提纲|MVP|原型|漏斗|验证任务卡|实验|测试数据/iu],
];

// A report of completed checking may update a saved comparison without an edit verb.
export function reportsCompetitorVerification(message: string) {
  return message.split(/[。；;\n]/u).some(statement =>
    /(?:(?:已|已经|刚|刚刚)\s*(?:核实|核对|确认|查证|验证)(?:过|了)?|(?:核实|核对|确认|查证|验证)(?:过|了|完毕|完成|好了)|确认无误|查过(?:官网|官方|价格))/u.test(statement)
    && !/[？?]|是否|有没有|如何|怎么|未核实|未确认|未核对|还没|尚未|没有|没(?:有)?\s*(?:核实|核对|确认|查证|验证)|(?:不|未)(?:是|能|算)|假如|如果|假设|比如|例如|(?:不要|不用|无需|别)\s*(?:修改|更新|记录|标记)/u.test(statement));
}

export const competitorFieldLabels: Record<CompetitorCitation["field"], RegExp> = {
  audience:/目标用户|用户群体|受众|客户|面向|使用者/u, task:/任务|用途|用来|解决/u,
  feature:/功能|能力|支持/u, price:/价格|定价|费用|收费|免费|付费|月费|年费|订阅/u, limitation:/限制|局限|不足|缺点/u,
};
export type CompetitionConfirmation = {name: string; fields: CompetitorCitation["field"][]; quote: string; contextQuote?: string};

// Resolve a follow-up only when a single product and field are unambiguous in recent dialogue.
export function competitionConfirmations(competitors: Competitor[], messages: ProjectState["messages"], message: string): CompetitionConfirmation[] {
  const keys = Object.keys(competitorFieldLabels) as CompetitorCitation["field"][];
  const mentioned = (content: string) => competitors.filter(candidate => content.normalize("NFKC").toLowerCase().includes(candidate.name.normalize("NFKC").toLowerCase()));
  const namedFields = (content: string) => keys.filter(field => competitorFieldLabels[field].test(content));
  const recent = messages.slice(-6).reverse();
  return message.split(/[。；;\n]/u).flatMap(quote => {
    if (!reportsCompetitorVerification(quote)) return [];
    let candidates = mentioned(quote), selected = namedFields(quote), contextQuote: string | undefined;
    // Multiple products in one statement need model clarification, rather than spreading a status.
    if (candidates.length > 1) return [];
    if (!candidates.length || !selected.length) {
      for (const entry of recent) {
        if (entry.content.length > 700 || (entry.task && entry.task.section !== "competitors")) break;
        const contextCandidates = mentioned(entry.content), contextFields = namedFields(entry.content);
        if (contextCandidates.length > 1 || contextFields.length > 1) break;
        if (contextCandidates.length === 1 && (!candidates.length || contextCandidates[0].name === candidates[0].name)
          && (selected.length || contextFields.length === 1)) {
          candidates = candidates.length ? candidates : contextCandidates;
          selected = selected.length ? selected : contextFields;
          contextQuote = entry.content;
          break;
        }
      }
    }
    if (!candidates.length && competitors.length === 1) candidates = competitors;
    if (candidates.length !== 1) return [];
    if (/所有字段|全部字段|全部信息|所有信息|各项信息|整行/u.test(quote)) selected = keys;
    return selected.length ? [{name:candidates[0].name,fields:selected,quote:quote.trim(),...(contextQuote?{contextQuote}:{})}] : [];
  });
}

function actionableClauses(message: string) {
  return message.split(/[，,。；;\n]/u).filter(clause => {
    if (!action.test(clause)) return false;
    // Reporting a past experience is evidence context, not a request to generate a plan.
    if (/^(?:我|我们|受访者|用户|他|她).*(?:昨天|上次|之前|已经|曾经|刚刚|上周|花了|用了)/u.test(clause)
      && !/(?:请|帮我|给我|希望你|要求你)\s*(?:生成|整理|分析|修改|设计|更新)/u.test(clause)) return false;
    if (/(?:不要|不用|无需|别|暂不|暂时不)\s*(?:再|帮我|给我)?\s*(?:生成|整理|总结|判断|比较|检查|核对|更新|制作|制定|设计|编写|拟定|输出|分析|评估|评分|打分|诊断|修改|改写|修订|调整|完善|优化|重写|迭代|删除|删掉|移除|去掉|改成|改为|替换|补充|添加|增加|只保留|仅保留)/u.test(clause)) return false;
    // Asking how to perform a task is still a question, unless execution is explicit.
    if (/解释|介绍|什么是|是什么|是什么意思|有哪些|有什么|有没有|原理|为什么|如何|怎么/u.test(clause)
      && !/(?:帮我|给我|请你|请帮我)\s*(?:生成|整理|更新|制作|制定|设计|编写|拟定|输出|分析|评估|评分|打分|诊断|修改|改写|修订|调整|完善|优化|重写|迭代)/u.test(clause)) return false;
    return true;
  });
}

// Route explicit tasks; ambiguous requests keep their current conversational context.
export function planConversation(section: Section, message: string, referenceText = "", manualSearch = false, state?: Pick<ProjectState, "artifacts" | "messages"> & Partial<Pick<ProjectState, "pending" | "competitionWorkspace">>): ConversationPlan {
  if (manualSearch) return { section: "competitors", kind: "webResearch", label: "联网竞品研究", createArtifact: true };
  const clauses = actionableClauses(message);
  const target = targets.find(([, pattern]) => clauses.some(clause => pattern.test(clause)))?.[0];
  if (target) return { section: target, kind: "artifact", label: `${sectionLabels[target]}任务`, createArtifact: true };
  if (section === "diagnosis" && clauses.some(clause => /评分|打分/u.test(clause)))
    return {section:"diagnosis",kind:"artifact",label:"创意诊断评分",createArtifact:true};
  const pendingArtifact = state?.pending?.artifact;
  const lastCompetition = pendingArtifact?.competition || (state && currentCompetition(state)?.artifact.competition);
  if (lastCompetition && reportsCompetitorVerification(message)
    && (section === "competitors" || pendingArtifact?.section === "competitors" || state?.messages.at(-1)?.task?.section === "competitors"
      || /竞品|竞争对手/u.test(message) || competitionConfirmations(lastCompetition.competitors,state?.messages || [],message).length))
    return {section:"competitors",kind:"artifact",label:"竞品核实更新",createArtifact:true};
  if (lastCompetition && (section === "competitors" || pendingArtifact?.section === "competitors" || state?.messages.at(-1)?.task?.section === "competitors")
    && clauses.some(clause => competitorEdit.test(clause) && (/类别|分类|功能|价格|对照|表格|范围|差异|缺口|反向|待核|对象|标题|限制|下一步|这份|这版/u.test(clause) || lastCompetition.competitors.some(candidate => clause.includes(candidate.name)))))
    return {section:"competitors",kind:"artifact",label:"竞品分析修订",createArtifact:true};
  const lastResearch = pendingArtifact?.section === "research" ? pendingArtifact : state?.artifacts.filter(artifact => artifact.section === "research").at(-1);
  const continuingInterview = lastResearch && !lastResearch.mvp && !lastResearch.survey && !lastResearch.funnel
    && /访谈|采访|提纲|招募/u.test(lastResearch.title + "\n" + lastResearch.content)
    && (section === "research" || pendingArtifact?.section === "research" || state?.messages.at(-1)?.task?.section === "research");
  if (continuingInterview && clauses.some(clause => revision.test(clause) && /提问|问题|这份|这版|版本|一版/u.test(clause)))
    return {section:"research", kind:"artifact", label:"访谈提纲修订", createArtifact:true};
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
