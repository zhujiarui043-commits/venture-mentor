import { numberAnalysisRecords, sectionLabels, type ProjectState, type Section } from "./types";

const common = new Set(["这个","那个","项目","问题","分析","帮我","一下","之前","生成","当前","需要","应该","可以","什么","还有","我们","我的","是否","如何","结果"]);

function queryTerms(message: string) {
  const terms = new Set<string>();
  for (const word of message.toLowerCase().match(/[a-z][a-z0-9_-]{2,}|[\u4e00-\u9fff]+/gu) || []) {
    if (/^[\u4e00-\u9fff]+$/u.test(word)) {
      if (word.length === 2 && !common.has(word)) terms.add(word);
      for (let i = 0; i < word.length - 1; i++) {
        const pair = word.slice(i, i + 2);
        if (!common.has(pair)) terms.add(pair);
      }
    } else terms.add(word);
  }
  return [...terms].slice(0, 30);
}

function relevance(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.reduce((score, term) => score + (lower.includes(term) ? (term.length > 3 ? 3 : 1) : 0), 0);
}

function excerpt(text: string, terms: string[], limit: number) {
  if (text.length <= limit) return text;
  const lower = text.toLowerCase();
  const matched = terms.map(term => lower.indexOf(term)).filter(index => index >= 0);
  const start = matched.length ? Math.max(0, Math.min(...matched) - 100) : 0;
  return `${start ? "…" : ""}${text.slice(start, start + limit)}${start + limit < text.length ? "…" : ""}`;
}

export function selectRelevantMemory(state: ProjectState, section: Section, message: string) {
  const terms = queryTerms(message);
  const explicitIds = new Set((message.match(/\b(?:H|M|A)\d{2,}\b/giu) || []).map(id => id.toUpperCase()));
  const archivedArtifacts = numberAnalysisRecords(state.artifacts).slice(0, -3).map((a, index) => ({
    value: a,
    score: relevance(`${a.title} ${a.content} ${a.limitations} ${a.nextStep}`, terms) + (a.section === section ? 3 : 0) + (explicitIds.has(a.recordId!.toUpperCase()) ? 20 : 0),
    index,
  })).filter(x => x.score > 0).sort((a, b) => b.score - a.score || b.index - a.index).slice(0, 3).map(({ value: a }) => ({
    id:a.id, recordId:a.recordId, section:sectionLabels[a.section], version:a.version, title:a.title,
    content:excerpt(a.content,terms,1000), limitations:a.limitations.slice(0,280), nextStep:a.nextStep.slice(0,280),
  }));
  const materials = (state.materials || []).map((m, index) => ({
    value:m,
    score: relevance(`${m.kind || ""} ${m.content}`,terms) + (explicitIds.has(m.id.toUpperCase()) ? 30 : 0) + (section === "research" ? 1 : 0),
    index,
  })).filter(x => x.score > 1).sort((a, b) => b.score - a.score || b.index - a.index).slice(0, 2).map(({value:m}) => ({
    id:m.id, kind:m.kind || "其他", at:m.at, excerpt:excerpt(m.content,terms,1200),
  }));
  const userMessages = state.messages.slice(0, -16).map((m, index) => ({value:m,score:m.role === "user" ? relevance(m.content,terms) : 0,index}))
    .filter(x => x.score > 1).sort((a,b) => b.score - a.score || b.index - a.index).slice(0,2).map(({value:m}) => ({
      id:m.id || "旧消息", at:m.at, content:excerpt(m.content,terms,500),
    }));
  return { archivedArtifacts, materials, userMessages };
}
