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
  confirmation: "待用户确认" | "用户已确认" | "自动记录";
  verification: "未核验" | "已有材料待评估";
  sourceRef?: string;
  updatedAt: string;
};
export type EvidenceRecord = {
  id: string; hypothesisVersion: number; direction: "support" | "opposition" | "boundary";
  quote: string; sourceId: string; sourceLocation?: string; subject?: string;
  limitations?: string; recordedAt: string; level?: "E1" | "E2"; relevance?: string;
};
export const interviewEvidenceStatuses = ["初步支持", "初步不支持", "证据不一致", "证据不足"] as const;
export type HypothesisAssessment = {
  hypothesisId: string; hypothesisVersion: number;
  evidenceStatus: typeof interviewEvidenceStatuses[number];
  researchMethods?: ResearchMode[];
  rationale: string; limitations: string; nextStep: string; sourceIds: string[];
  evidence: { source: string; quote: string; direction: "support" | "opposition" | "boundary"; level: "E1" | "E2"; relevance: string; subject: string }[];
};
export type RecordedHypothesisAssessment = HypothesisAssessment & { assessedAt: string };
export type HypothesisUpdate = {
  hypothesisId: string; hypothesisVersion: number; priority: "高" | "中" | "低";
  rationale: string; nextStep: string;
};
export type HypothesisHistory = {
  version: number; text: string; reason: string; at: string;
  category?: string; stage?: string; evidenceStatus?: string; priority?: string; nextStep?: string;
  support?: string[]; opposition?: string[]; evidenceRecords?: EvidenceRecord[]; processLabel?: string;
  assessment?: RecordedHypothesisAssessment; assessmentHistory?: RecordedHypothesisAssessment[];
};
export type Hypothesis = {
  id: string; version: number; text: string; category: string; stage: string;
  evidenceStatus: string; priority: string; nextStep: string; support: string[];
  opposition: string[]; evidenceRecords?: EvidenceRecord[]; processLabel?: string;
  editHistory?: { previousText: string; at: string; reason: string }[];
  assessment?: RecordedHypothesisAssessment; assessmentHistory?: RecordedHypothesisAssessment[];
  priorityRationale?: string;
  priorityHistory?: { hypothesisVersion: number; previous: string; current: string; rationale: string; at: string }[];
  history: HypothesisHistory[];
};
export type DiagnosisDimension = {
  name: string;
  attention: "当前稳定" | "需要关注" | "优先验证" | "信息待补充" | "建议调整";
  priority: "高" | "中" | "低";
  judgment: string; sourceRefs: string[]; hypothesisRefs: string[];
  limitations: string; riskImpact: string; nextStep: string;
  score?: number; scoreReason?: string; scoreConfidence?: "低" | "中" | "高";
  scoreUpdatedAt?: string; scoreTriggerRefs?: string[];
};
export function isDiagnosisScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
}
export type DiagnosisData = {
  summary: string; keyRisk: string; firstQuestion: string;
  dimensions: DiagnosisDimension[];
  scoringVersion?: "kb04-radar-v1";
  changes?: { name: string; previous: string; current: string; previousScore?: number; currentScore?: number; triggerRefs?: string[] }[];
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
export type Competitor = { name: string; kind: string; audience: string; task: string; feature: string; price: string; limitation: string; sourceQuote: string; sourceId: string; sourceDate: string; verification: "用户材料待核" | "网页资料待核" | "待核实" | "用户已核实" | "部分字段已核实"; sourceUrl?: string; sourceRetrievedAt?: string; citations?: CompetitorCitation[]; unverifiedFields?: CompetitorCitation["field"][]; userVerifications?: Partial<Record<CompetitorCitation["field"], {quote: string; confirmedAt: string; contextQuote?: string}>> };
export type CompetitionData = { scope: string; competitors: Competitor[]; gap: string; counterExplanation: string; unknowns: string[]; webSearch?: WebSearchSnapshot };
export type CompetitionSelection = { artifactId: string; competitorIndex: number };
export type CompetitionWorkspaceRow = CompetitionSelection & { retained: boolean };
export type CompetitionWorkspace = { artifactId: string; rows: CompetitionWorkspaceRow[] };
export type Artifact = {
  id: string; section: Section; title: string; content: string; sources: Source[];
  recordId?: string;
  researchMode?: ResearchMode;
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
  hypothesisAssessments?: HypothesisAssessment[];
  hypothesisUpdates?: HypothesisUpdate[];
  createdAt: string;
  webSearch?: WebSearchSnapshot;
  replyCitations?: WebReplyCitation[];
  searchWarning?: string;
  suggestedQuestions?: string[];
};
export type Message = { id?: string; artifactId?: string; role: "user" | "assistant"; content: string; at: string; webSearch?: WebSearchSnapshot; replyCitations?: WebReplyCitation[]; searchWarning?: string; suggestedQuestions?: string[]; task?: {label:string;section:Section} };
export type ProjectState = {
  id: string; title: string; rawIdea: string; fields: Record<string, string>;
  fieldStatuses?: Record<string, "用户陈述" | "初步设想" | "待验证">;
  fieldMeta?: Record<string, FieldMeta>;
  hypotheses: Hypothesis[]; artifacts: Artifact[]; messages: Message[];
  competitionWorkspace?: CompetitionWorkspace;
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

export function cleanRecordName(name: string): string {
  // Strip an entire generated identifier label, including its category suffix.
  // A legitimate word such as “类似产品” or “类型” is part of the title.
  const prefix = /^\s*(?:[【[(（]\s*)?(?:(?:分析记录|用户材料|材料|记录)\s*)?[ACDBORHMQTU](?:\d+|X{1,2})(?![a-z0-9])(?:\s*[-_·]\s*V\d+)?\s*(?:类(?!似|型|别|比|目)\s*)?(?:[】\])）]\s*)?[·:：、.．_…—–-]*\s*/iu;
  let title = name.trim();
  while (prefix.test(title)) title = title.replace(prefix, "").trim();
  // Repair the orphaned suffix left by earlier M-number cleanup.
  title = title.replace(/^类(?!似|型|别|比|目)\s*[·:：、.．_…—–-]*\s*(?=访谈|采访|提纲|招募|问卷|调查|MVP|调研|竞品|诊断|商业|画布|用户|校园)/iu, "");
  return title.replace(/(?:\s*[·:：_—–-]\s*V\d+|\s+V\d+|\s*[（(]\s*V\d+\s*[）)])\s*$/iu, "").trim();
}

export function analysisRecordTitle(artifact: Pick<Artifact, "section" | "title" | "content">): string {
  if (!artifact.title.trim()) return artifact.title;
  const title = cleanRecordName(artifact.title);
  if (title) return title;
  return artifact.section === "research" && /访谈|采访|提纲|招募/u.test(artifact.content)
    ? "访谈提纲" : `${sectionLabels[artifact.section]}记录`;
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

export const researchModes = ["用户访谈", "问卷调查", "MVP 测试"] as const;
export type ResearchMode = typeof researchModes[number];

export function researchTextModes(text: string): ResearchMode[] {
  return researchModes.filter(mode => mode === "用户访谈"
    ? /访谈|受访者/u.test(text)
    : mode === "问卷调查"
      ? /问卷|调查题目|调查结果/u.test(text)
      : /\bmvp\b|漏斗|原型测试|测试数据|验证任务卡|实验(?:方案|计划|结果|数据)/iu.test(text));
}

export function artifactResearchModes(artifact: Artifact): ResearchMode[] {
  if (artifact.researchMode && researchModes.includes(artifact.researchMode)) return [artifact.researchMode];
  const title = cleanRecordName(artifact.title);
  if (/访谈(?:提纲|方案|计划)|(?:探索性|用户)访谈(?:提纲|问题)/u.test(title) ||
    (!researchTextModes(title).length && /^\s*访谈类型\s*[:：]/u.test(artifact.content))) return ["用户访谈"];
  const structured: ResearchMode[] = [];
  if (artifact.interview) structured.push("用户访谈");
  if (artifact.survey) structured.push("问卷调查");
  if (artifact.mvp || artifact.funnel) structured.push("MVP 测试");
  if (structured.length) return structured;
  // Legacy plans may mention other methods; prefer their own title.
  const titleModes = researchTextModes(artifact.title);
  return titleModes.length ? titleModes : researchTextModes(artifact.content);
}

export const researchRecordPrefixes: Record<ResearchMode, string> = {"用户访谈": "A", "问卷调查": "Q", "MVP 测试": "T"};

export const analysisRecordPrefixes: Record<Section, string> = {
  overview: "O", diagnosis: "D", competitors: "C", hypotheses: "R", research: "A", canvas: "B",
};

// Each module has a contiguous sequence in saved order; UUIDs stay intact.
export function numberAnalysisRecords(artifacts: Artifact[]): Artifact[] {
  const counts = new Map<string, number>();
  return artifacts.map(artifact => {
    const mode = artifact.section === "research" ? artifactResearchModes(artifact)[0] : undefined;
    // Unclassified research keeps its own sequence until its method is known.
    const prefix = artifact.section === "research" ? (mode ? researchRecordPrefixes[mode] : "U") : analysisRecordPrefixes[artifact.section];
    const key = `${artifact.section}:${prefix}`;
    const next = (counts.get(key) || 0) + 1;
    counts.set(key, next);
    const recordId = `${prefix}${String(next).padStart(2, "0")}`;
    const title = analysisRecordTitle(artifact);
    return artifact.recordId === recordId && artifact.title === title ? artifact : {...artifact, recordId, title};
  });
}

// Migrate legacy gaps and cross-references together, without rewriting any quoted text.
export function normalizeProjectNumbers(state: ProjectState): ProjectState {
  const references = new Map<string, string>();
  const labels = new Map<string, string>();
  const numbered = numberAnalysisRecords(state.artifacts);
  state.artifacts.forEach((artifact, index) => {
    if (artifact.recordId) {
      references.set(artifact.recordId, artifact.id);
      labels.set(artifact.recordId, numbered[index].recordId!);
    }
  });
  const numberedId = (prefix: string, index: number) => `${prefix}${String(index + 1).padStart(2, "0")}`;
  state.hypotheses.forEach((h, index) => {
    references.set(h.id, numberedId("H", index));
    labels.set(h.id, numberedId("H", index));
  });
  (state.materials || []).forEach((m, index) => {
    references.set(m.id, numberedId("M", index));
    labels.set(m.id, numberedId("M", index));
  });
  const referenceKeys = new Set(["sourceRef", "sourceRefs", "sourceIds", "scoreTriggerRefs", "triggerRefs", "hypothesisRefs", "hypothesisRef", "hypothesisId", "targetId", "sourceId", "source"]);
  const remap = (value: unknown, key = ""): unknown => {
    if (typeof value === "string") {
      if (key === "label") return value.replace(/\b[ACDBORHMQTU]\d+\b/gu, id => labels.get(id) || id);
      if (!referenceKeys.has(key)) return value;
      return references.get(value) || value.replace(/\b[HM]\d+\b/gu, id => references.get(id) || id);
    }
    if (Array.isArray(value)) return value.map(item => remap(item, key));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, remap(item, name)]));
    return value;
  };
  const result = remap(state) as ProjectState;
  result.artifacts = numberAnalysisRecords(result.artifacts);
  result.hypotheses.forEach((h, index) => { h.id = numberedId("H", index); });
  (result.materials || []).forEach((m, index) => { m.id = numberedId("M", index); });
  return result;
}
