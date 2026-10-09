import type { CompetitionData, Competitor, CompetitorCitation, ProjectState, WebSearchSnapshot } from "./types";

export class CompetitorSearchError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export function safeWebUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return;
    url.hash = "";
    return url.href;
  } catch { return; }
}

export function buildCompetitorQuery(state: ProjectState, message: string, searchQuery = ""): string {
  const explicit = searchQuery.trim().replace(/\s+/gu, " ");
  if (explicit) return explicit.slice(0, 360);
  const direction = [state.fields.solution, state.fields.problem, state.fields.audience, state.fields.alternative]
    .filter(Boolean).map(value => value.trim().replace(/\s+/gu, " ").slice(0, 65)).join(" ");
  const idea = direction || state.rawIdea.trim().replace(/\s+/gu, " ").slice(0, 220);
  if (!idea) throw new CompetitorSearchError("请先记录项目方向，或填写搜索词，例如“大学生 访谈分析工具 竞品”。", 400);
  // Send only the project direction and a short current request, never the full conversation or uploaded material.
  return `${idea} ${message.trim().replace(/\s+/gu, " ").slice(0, 60)} 竞品 替代产品 官网 功能 价格`.slice(0, 390);
}

export async function searchCompetitors(query: string, apiKey: string | undefined, fetcher: typeof fetch = fetch): Promise<WebSearchSnapshot> {
  const key = apiKey?.trim();
  if (!key) throw new CompetitorSearchError("联网搜索尚未配置，请在服务器设置 TAVILY_API_KEY 后重试。", 503);
  if (!query.trim() || query.length > 400) throw new CompetitorSearchError("搜索词不能为空，且不能超过 400 字。", 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher("https://api.tavily.com/search", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, topic: "general", search_depth: "advanced", max_results: 6, chunks_per_source: 3,
        include_answer: false, include_raw_content: false, include_images: false, include_published_date: true, auto_parameters: false }),
      signal: controller.signal,
    });
    // Never return upstream bodies: they may contain account details or reflect the secret.
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw new CompetitorSearchError("Tavily 密钥无效或无权限，请检查服务器的 TAVILY_API_KEY。", 503);
      if (response.status === 429) throw new CompetitorSearchError("联网搜索请求过于频繁，请稍后重试。", 429);
      if ([432, 433].includes(response.status)) throw new CompetitorSearchError("Tavily 搜索额度已用完，请检查账号额度后重试。", 503);
      throw new CompetitorSearchError("联网搜索服务暂时不可用，请稍后重试。");
    }
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("results" in data) || !Array.isArray(data.results))
      throw new CompetitorSearchError("联网搜索返回格式异常，请稍后重试。");
    const results: WebSearchSnapshot["results"] = [];
    const seen = new Set<string>();
    for (const item of data.results) {
      if (!item || typeof item !== "object") continue;
      const url = safeWebUrl(item.url);
      const content = typeof item.content === "string" ? item.content.trim().slice(0, 1800) : "";
      if (!url || !content || seen.has(url)) continue;
      seen.add(url);
      results.push({ id: `W${String(results.length + 1).padStart(2, "0")}`, url, content,
        title: typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 180) : new URL(url).hostname,
        ...(typeof item.published_date === "string" && item.published_date.trim() ? { publishedDate: item.published_date.trim().slice(0, 80) } : {}),
      });
      if (results.length === 6) break;
    }
    if (!results.length) throw new CompetitorSearchError("没有搜到可用网页资料，请调整搜索词后重试；本轮未修改项目记录。", 422);
    return { query, searchedAt: new Date().toISOString(), results };
  } catch (error) {
    if (error instanceof CompetitorSearchError) throw error;
    if (controller.signal.aborted || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)))
      throw new CompetitorSearchError("联网搜索超时，请稍后重试；本轮未修改项目记录。", 504);
    throw new CompetitorSearchError("无法连接联网搜索服务，请检查网络后重试；本轮未修改项目记录。");
  } finally { clearTimeout(timeout); }
}

export function groundCompetition(data: CompetitionData, referenceText: string, webSearch?: WebSearchSnapshot): CompetitionData {
  const competitors: Competitor[] = [];
  for (const c of data.competitors.slice(0, 10)) {
    const quote = c.sourceQuote.trim();
    const web = webSearch?.results.find(result => result.id === c.sourceId && quote && result.content.includes(quote));
    const fromMaterial = !!quote && !!referenceText && referenceText.includes(quote) && (!webSearch || c.sourceId === "当前材料");
    const citations: CompetitorCitation[] = [];
    for (const citation of (c.citations || []).slice(0, 15)) {
      const excerpt = citation.quote.trim();
      if (!excerpt) continue;
      const result = webSearch?.results.find(result => result.id === citation.sourceId && result.content.includes(excerpt));
      if (result) citations.push({ field: citation.field, sourceId: result.id, quote: excerpt.slice(0, 350), url: result.url,
        sourceDate: result.publishedDate || "", retrievedAt: webSearch!.searchedAt });
      else if (citation.sourceId === "当前材料" && referenceText.includes(excerpt))
        citations.push({ field: citation.field, sourceId: "当前材料", quote: excerpt.slice(0, 350) });
    }
    // A web candidate must actually be named in its source. Discard fabricated candidates and source IDs.
    if (webSearch && !fromMaterial && (!web || !c.name.trim() || !`${web.title} ${web.content}`.toLowerCase().includes(c.name.trim().toLowerCase()))) continue;
    const grounded = !!web || fromMaterial;
    const candidate: Competitor = {
      name: c.name.slice(0, 100), kind: c.kind.slice(0, 100),
      audience: c.audience.slice(0, 350), task: c.task.slice(0, 350), feature: c.feature.slice(0, 350),
      price: c.price.slice(0, 350), limitation: c.limitation.slice(0, 350),
      sourceQuote: grounded ? quote.slice(0, 350) : "", sourceId: web ? web.id : fromMaterial ? "当前材料" : "",
      sourceDate: web ? web.publishedDate || "" : fromMaterial && c.sourceDate && referenceText.includes(c.sourceDate) ? c.sourceDate : "",
      verification: web ? "网页资料待核" : fromMaterial ? "用户材料待核" : "待核实",
      ...(web ? { sourceUrl: web.url, sourceRetrievedAt: webSearch!.searchedAt } : {}),
      ...(citations.length ? { citations } : {}),
    };
    for (const field of ["audience", "task", "feature", "price", "limitation"] as const) {
      if (!grounded || (webSearch && !citations.some(citation => citation.field === field))) candidate[field] = "待核实";
    }
    competitors.push(candidate);
  }
  return { scope: data.scope.slice(0, 500), competitors, gap: data.gap.slice(0, 1000),
    counterExplanation: data.counterExplanation.slice(0, 1000), unknowns: data.unknowns.slice(0, 10),
    ...(webSearch ? { webSearch } : {}),
  };
}
