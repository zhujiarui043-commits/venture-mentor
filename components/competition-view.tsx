import { ChevronRight } from "lucide-react";
import type { CompetitionData } from "@/lib/types";
import { SourceLink, WebSources } from "./source-links";

const labels = {audience:"目标用户", task:"任务", feature:"功能", price:"价格", limitation:"限制"};

// The overview is the only comparison table; sources live in the records below.
export function CompetitionTable({competition}: {competition: CompetitionData}) {
  return <section className="structured-result competition-view">
    <h4>竞品与替代方式 · {competition.scope || "范围待确认"}</h4>
    {competition.competitors.length ? <div className="comparison-scroll" tabIndex={0} role="region" aria-label="竞品对照表，可横向滚动">
      <table className="competition-table">
        <caption>窄屏可左右滑动。来源和判断依据见下方“分析记录与来源”。</caption>
        <colgroup><col className="competition-object-col"/><col className="competition-users-col"/><col className="competition-features-col"/></colgroup>
        <thead><tr><th scope="col">对象 / 类别</th><th scope="col">用户与任务</th><th scope="col">功能 / 价格</th></tr></thead>
        <tbody>{competition.competitors.map((c, i) => <tr key={i}>
          <th scope="row"><strong>{c.name}</strong><small>{c.kind}</small></th>
          <td><div>{c.audience}</div><div className="comparison-attribute"><span>任务</span>{c.task}</div></td>
          <td><div>{c.feature}</div><div className="comparison-attribute"><span>价格</span>{c.price}</div><div className="comparison-attribute"><span>限制</span>{c.limitation}</div></td>
        </tr>)}</tbody>
      </table>
    </div> : <p>本轮尚无有来源支持的可比较对象。展开下方记录查看网页来源，或调整搜索词。</p>}
  </section>;
}

export function CompetitionDetails({competition}: {competition: CompetitionData}) {
  return <div className="structured-result competition-details">
    <h4>比较范围 · {competition.scope || "待确认"}</h4>
    {competition.competitors.map((c, i) => <details className="competitor-detail" key={i}>
      <summary>
        <span><strong>{c.name}</strong><small>{c.kind} · {c.verification}</small></span>
        <ChevronRight size={17} className="record-chevron" aria-hidden="true"/>
      </summary>
      <div className="competitor-detail-body">
        <dl>{(Object.keys(labels) as (keyof typeof labels)[]).map(field => <div key={field}><dt>{labels[field]}</dt><dd>{c[field] || "待核实"}</dd></div>)}</dl>
        <div className="competitor-source">
          <h5>来源与核实状态</h5><p>{c.verification}</p>
          {c.sourceId ? <>
            <SourceLink url={c.sourceUrl}>{c.sourceId} · 查看来源</SourceLink>
            <p>{c.sourceDate ? "发布日期：" + c.sourceDate : "发布日期未提供"}{c.sourceRetrievedAt && <> · 检索于 {new Date(c.sourceRetrievedAt).toLocaleString("zh-CN")}</>}</p>
            {c.sourceQuote && <blockquote>{c.sourceQuote}</blockquote>}
          </> : <p>尚无可回查的来源。</p>}
          {!!c.citations?.length && <div className="claim-citations"><h5>逐项依据</h5>{c.citations.map((citation, j) => <blockquote key={j}>
            <b>{labels[citation.field]} · </b><SourceLink url={citation.url}>{citation.sourceId}</SourceLink>
            <p>{citation.quote}</p>
            {(citation.sourceDate || citation.retrievedAt) && <small>{citation.sourceDate && <>发布日期：{citation.sourceDate}</>}{citation.retrievedAt && <> · 检索于 {new Date(citation.retrievedAt).toLocaleString("zh-CN")}</>}</small>}
          </blockquote>)}</div>}
        </div>
      </div>
    </details>)}
    {!competition.competitors.length && <p>本轮未形成可核对的产品比较，请查看网页摘录。</p>}
    <div className="competition-conclusions">
      <p><b>候选缺口（待验证）</b>{competition.gap || "待核实"}</p>
      <p><b>反向解释</b>{competition.counterExplanation || "待核实"}</p>
      {!!competition.unknowns.length && <div><b>待核实事项</b><ul>{competition.unknowns.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
    </div>
    {competition.webSearch && <WebSources search={competition.webSearch}/>}
  </div>;
}
