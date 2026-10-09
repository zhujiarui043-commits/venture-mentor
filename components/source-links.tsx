import type { ReactNode } from "react";
import type { WebSearchSnapshot } from "@/lib/types";

export function SourceLink({url, children}: {url?: string; children: ReactNode}) {
  let safe = "";
  try {
    const parsed = new URL(url || "");
    if (["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password) safe = parsed.href;
  } catch {}
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
}

export function WebSources({search}: {search: WebSearchSnapshot}) {
  return <details className="web-sources">
    <summary>查看本轮网页来源 · {search.results.length} 条</summary>
    <p>搜索词：{search.query}</p>
    <p>检索于 {new Date(search.searchedAt).toLocaleString("zh-CN")}。网页摘录可能不完整，发布日期与检索时间分别记录；功能与价格请回查原网页。</p>
    {search.results.map(result => <article key={result.id}>
      <strong><SourceLink url={result.url}>{result.id} · {result.title}</SourceLink></strong>
      <small>{result.publishedDate ? "发布日期：" + result.publishedDate : "发布日期未提供"}</small>
      <blockquote>{result.content}</blockquote>
    </article>)}
  </details>;
}
