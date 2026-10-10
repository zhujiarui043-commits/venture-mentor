export const sections = ["overview", "diagnosis", "competitors", "hypotheses", "research", "canvas"] as const;
export const diagnosisNames = ["目标用户明确度", "痛点真实性", "痛点强度", "解决方案匹配度", "竞品差异化", "付费可能性", "获客可行性", "执行可行性"] as const;
export type Section = typeof sections[number];
export type Source = { label: string; detail?: string; date?: string; url?: string; retrievedAt?: string };
export type WebSearchResult = { id: string; title: string; url: string; content: string; publishedDate?: string };
export type WebSearchSnapshot = { query: string; searchedAt: string; results: WebSearchResult[] };
export type WebReplyCitation = { sourceId: string; quote: string; title: string; url: string; retrievedAt: string; publishedDate?: string };
export type FieldMeta = {
  origin: "用户原话" | "AI归纳" | "材料摘录" | "旧记录来源待核";
  statementKind: "陈述" | "初步设想" | "未区分";
  confirmation: "待用户确认" | "用户已确认";
  verification: "未核验" | "已有材料待评估";
  sourceRef?: string;
  updatedAt: string;
};
export type EvidenceRecord = {
  id: string; hypothesisVersion: number; direction: "support" | "opposition" | "boundary";
  quote: string; sourceId: string; sourceLocation?: string; subject?: string;
  limitations?: string; recordedAt: string;
};
export type HypothesisHistory = {
  version: number; text: string; reason: string; at: string;
  category?: string; stage?: string; evidenceStatus?: string; priority?: string; nextStep?: string;
  support?: string[]; opposition?: string[]; evidenceRecords?: EvidenceRecord[]; processLabel?: string;
};
export type Hypothesis = {
  id: string; version: number; text: string; category: string; stage: string;
  evidenceStatus: string; priority: string; nextStep: string; support: string[];
  opposition: string[]; evidenceRecords?: EvidenceRecord[]; processLabel?: string;
  editHistory?: { previousText: string; at: string; reason: string }[];
  history: HypothesisHistory[];
};
export type DiagnosisDimension = {
  name: string;
  attention: "当前稳定" | "需要关注" | "优先验证" | "信息待补充" | "建议调整";
  priority: "高" | "中" | "低";
  judgment: string; sourceRefs: string[]; hypothesisRefs: string[];
  limitations: string; riskImpact: string; nextStep: string;
};
export type DiagnosisData = {
  summary: string; keyRisk: string; firstQuestion: string;
  dimensions: DiagnosisDimension[];
  changes?: { name: string; previous: string; current: string }[];
};
export type InterviewAnalysis = {
  sourceId: string;
  quotes: { quote: string; direction: "支持" | "反向" | "边界" | "背景"; hypothesisId?: string; sourceId?: string }[];
  limitations: string;
};
export type SurveyColumn = { name: string; missing: number; distinct: number; frequencies: { value: string; count: number }[] };
export type SurveySummary = { totalRows: number; columns: SurveyColumn[]; warnings: string[]; sourceId?: string };
export type MvpCard = {
  hypothesisRef: string; goal: string; method: string; target: string; scenario: string;
  steps: string[]; metrics: { name: string; numerator: string; denominator: string; window: string }[];
  threshold: string; duration: string; costLimit: string; stopCondition: string; risks: string;
};
export type FunnelSummary = {
  sourceId?: string; stages: { name: string; count: number; fromPrevious: number | null; rate: number | null }[];
  warnings: string[];
};
export const canvasNames = ["客户细分","价值主张","渠道通路","客户关系","收入来源","核心资源","关键活动","重要合作","成本结构"] as const;
export type CanvasModule = { name: typeof canvasNames[number]; content: string; sourceRefs: string[]; hypothesisRefs: string[]; status: "已记录" | "初步设想" | "待验证" | "未知"; limitations: string; nextStep: string };
export type CanvasData = { modules: CanvasModule[]; conflicts: string[]; changes?: { name: string; previous: string; current: string }[] };
export type CompetitorCitation = { field: "audience" | "task" | "feature" | "price" | "limitation"; sourceId: string; quote: string; url?: string; sourceDate?: string; retrievedAt?: string };
export type Competitor = { name: string; kind: string; audience: string; task: string; feature: string; price: string; limitation: string; sourceQuote: string; sourceId: string; sourceDate: string; verification: "用户材料待核" | "网页资料待核" | "待核实"; sourceUrl?: string; sourceRetrievedAt?: string; citations?: CompetitorCitation[]; unverifiedFields?: CompetitorCitation["field"][] };
export type CompetitionData = { scope: string; competitors: Competitor[]; gap: string; counterExplanation: string; unknowns: string[]; webSearch?: WebSearchSnapshot };
export type Artifact = {
  id: string; section: Section; title: string; content: string; sources: Source[];
  recordId?: string;
  limitations: string; nextStep: string; version: number; createdAt: string;
  diagnosis?: DiagnosisData;
  interview?: InterviewAnalysis;
  survey?: SurveySummary;
  mvp?: MvpCard;
  funnel?: FunnelSummary;
  canvas?: CanvasData;
  competition?: CompetitionData;
};
export type Proposal = {
  id: string; reply: string; fields: Record<string, string>;
  fieldRemovals?: string[];
  fieldStatuses?: Record<string, "用户陈述" | "初步设想" | "待验证">;
  fieldMeta?: Record<string, FieldMeta>;
  projectTitle?: string;
  artifact: Omit<Artifact, "id" | "version" | "createdAt"> | null;
  hypothesis: { text: string; category: string; priority: string; nextStep: string; targetId?: string; changeKind?: "措辞调整" | "实质修订" } | null;
  evidence: { hypothesisId: string; hypothesisVersion?: number; versionTarget?: "current" | "revised"; direction: "support" | "opposition" | "boundary"; quote: string; source: string }[];
  createdAt: string;
  webSearch?: WebSearchSnapshot;
  replyCitations?: WebReplyCitation[];
  searchWarning?: string;
  suggestedQuestions?: string[];
};
export type Message = { id?: string; role: "user" | "assistant"; content: string; at: string; webSearch?: WebSearchSnapshot; replyCitations?: WebReplyCitation[]; searchWarning?: string; suggestedQuestions?: string[]; task?: {label:string;section:Section} };
export type ProjectState = {
  id: string; title: string; rawIdea: string; fields: Record<string, string>;
  fieldStatuses?: Record<string, "用户陈述" | "初步设想" | "待验证">;
  fieldMeta?: Record<string, FieldMeta>;
  hypotheses: Hypothesis[]; artifacts: Artifact[]; messages: Message[];
  materials: { id: string; content: string; at: string; name?: string; kind?: "访谈记录" | "问卷数据" | "测试数据" | "其他" }[];
  pending: Proposal | null; updatedAt: string;
};
export const fieldLabels: Record<string, string> = {
  audience: "目标用户", scene: "使用场景", problem: "核心问题", solution: "解决方式",
  progress: "当前进展", resources: "团队资源", revenue: "收费设想", channel: "获客设想",
  alternative: "现有替代方式", technicalAssumption: "技术假设", constraints: "当前限制",
  buyer: "购买者", payer: "付费者", decisionMaker: "购买决策者",
  painFrequency: "问题发生频率", painCost: "目前付出的成本",
};
export const extraFieldKeys = ["buyer", "payer", "decisionMaker", "painFrequency", "painCost"] as const;
export const sectionLabels: Record<Section, string> = {
  overview: "项目总览", diagnosis: "创意诊断", competitors: "竞品洞察",
  hypotheses: "假设与证据", research: "调研验证", canvas: "商业画布",
};
export function emptyProject(id: string): ProjectState {
  return { id, title: "未命名项目", rawIdea: "", fields: {}, fieldStatuses: {}, fieldMeta: {}, hypotheses: [], artifacts: [], messages: [], materials: [], pending: null, updatedAt: new Date().toISOString() };
}

export function analysisRecordTitle(artifact: Pick<Artifact, "section" | "title" | "content">): string {
  if (artifact.section !== "research" || !/访谈|采访|提纲|招募/u.test(artifact.title + "\n" + artifact.content)) return artifact.title;
  const prefix = /^\s*(?:[【[(（]\s*)?(?:材料\s*)?M\d+\s*(?:[】\])）]\s*)?[·:：、.．_…—–-]*\s*/iu;
  return prefix.test(artifact.title) ? artifact.title.replace(prefix, "").trim() || "访谈提纲" : artifact.title;
}

export function nextArtifactVersion(artifacts: Artifact[], artifact: Proposal["artifact"]): number {
  if (!artifact) return 1;
  const title = analysisRecordTitle(artifact);
  const previous = artifacts.filter(a => a.section === artifact.section &&
    (artifact.diagnosis || artifact.canvas || artifact.competition ? true : artifact.mvp ? !!a.mvp : analysisRecordTitle(a) === title));
  return previous.reduce((max, a) => Math.max(max, a.version), 0) + 1;
}

export function pendingAnalysisRecord(state: ProjectState, proposal = state.pending): Artifact | null {
  const artifact = proposal?.artifact;
  return artifact && proposal ? {...artifact, title: analysisRecordTitle(artifact), id: `pending-${proposal.id}`,
    recordId: undefined, version: nextArtifactVersion(state.artifacts, artifact), createdAt: proposal.createdAt} : null;
}

// Analysis numbers have their own sequence; UUIDs and material references stay intact.
export function numberAnalysisRecords(artifacts: Artifact[]): Artifact[] {
  const recordNumber = (id?: string) => /^A\d+$/iu.test(id || "") ? Number(id!.slice(1)) : 0;
  let last = artifacts.reduce((max, artifact) => {
    const number = recordNumber(artifact.recordId);
    return Number.isSafeInteger(number) && number > 0 ? Math.max(max, number) : max;
  }, 0);
  const assigned = new Set<number>();
  return artifacts.map(artifact => {
    const number = recordNumber(artifact.recordId);
    const next = Number.isSafeInteger(number) && number > 0 && !assigned.has(number) ? number : ++last;
    assigned.add(next);
    const recordId = `A${String(next).padStart(2, "0")}`;
    const title = analysisRecordTitle(artifact);
    return artifact.recordId === recordId && artifact.title === title ? artifact : {...artifact, recordId, title};
  });
}
