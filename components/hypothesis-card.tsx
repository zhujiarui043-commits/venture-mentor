import { Badge } from "@/components/ui/badge";
import type { Hypothesis, ProjectState, RecordedHypothesisAssessment } from "@/lib/types";

function AssessmentDetails({assessment}:{assessment:RecordedHypothesisAssessment}) {
  return <div className="hyp-assessment"><p><b>调研判断：</b>{assessment.evidenceStatus}</p><p><b>判断依据：</b>{assessment.rationale}</p><p><b>当前限制：</b>{assessment.limitations}</p><p><b>调研方式：</b>{assessment.researchMethods ? assessment.researchMethods.join("、") || "通用或待分类材料" : "用户访谈"}</p><p><b>评估材料：</b>{assessment.sourceIds.join("、")}</p><small>{new Date(assessment.assessedAt).toLocaleString("zh-CN")} · 关联 V{assessment.hypothesisVersion}</small></div>;
}

export function HypothesisCard({h,materials=[]}:{h:Hypothesis;materials?:ProjectState["materials"]}) {
  const records=(h.evidenceRecords||[]).filter(e=>e.hypothesisVersion===h.version);
  const supportCount=h.support.length+records.filter(e=>e.direction==="support").length;
  const oppositionCount=h.opposition.length+records.filter(e=>e.direction!=="support").length;
  const sourceLabel=(id:string)=>{const m=materials.find(m=>m.id===id);return m?`${m.id}${m.name?` · ${m.name}`:""}`:/^M\d+$/u.test(id)?id:"用户对话"};
  return <article className="hyp-card">
    <div className="hyp-top"><b>{h.id}</b><Badge variant="outline">{h.priority}</Badge>{h.evidenceStatus!=="未进入验证"&&<Badge variant="outline">{h.evidenceStatus}</Badge>}</div>
    <h3>{h.text}</h3>
    <div className="hyp-meta"><span>阶段：{h.stage}</span><span>支持材料 {supportCount}</span><span>反向或边界材料 {oppositionCount}</span>{h.processLabel&&<span>处理：{h.processLabel}</span>}</div>
    {h.assessment&&<AssessmentDetails assessment={h.assessment}/>}
    <details><summary>查看证据与历史</summary>
      {h.priorityRationale&&<p>处理优先级依据：{h.priorityRationale}</p>}
      {(h.priorityHistory||[]).map((change,i)=><p key={`priority-${i}`}>优先级：{change.previous} → {change.current}（V{change.hypothesisVersion} · {new Date(change.at).toLocaleString("zh-CN")}）；依据：{change.rationale}</p>)}
      {records.map(e=><div key={e.id}><p>{e.direction==="support"?"支持":e.direction==="opposition"?"反向":"边界"}：{e.quote}（{sourceLabel(e.sourceId)}，{e.sourceLocation||"位置待核"}，关联 V{e.hypothesisVersion}；{e.level==="E2"?"具体经历或过去行为":e.level==="E1"?"观点或未来意愿":"证据强度待评估"}）</p>{e.relevance&&<p>关联依据：{e.relevance}</p>}{e.subject&&<p>对象或样本：{e.subject}</p>}</div>)}
      {h.support.map((x,i)=><p key={`old-s-${i}`}>旧记录支持材料：{x}（来源与版本待核）</p>)}
      {h.opposition.map((x,i)=><p key={`old-o-${i}`}>旧记录反向材料：{x}（来源与版本待核）</p>)}
      {(h.assessmentHistory||[]).map((a,i)=><details key={`assessment-${i}`}><summary>历史调研判断：{a.evidenceStatus} · {new Date(a.assessedAt).toLocaleString("zh-CN")}</summary><AssessmentDetails assessment={a}/>{a.evidence.map((e,j)=><p key={j}>{e.direction==="support"?"支持":e.direction==="opposition"?"反向":"边界"}：{e.quote}（{sourceLabel(e.source)}）</p>)}<p>当时下一步：{a.nextStep}</p></details>)}
      {(h.editHistory||[]).map((edit,i)=><p key={`edit-${i}`}>同版本措辞调整：{edit.previousText}（{new Date(edit.at).toLocaleDateString("zh-CN")}）</p>)}
      {h.history.map((old,i)=><details key={i}><summary>旧版 V{old.version}：{old.text}</summary><p>变更原因：{old.reason}；当时阶段：{old.stage||"未记录"}；证据状态：{old.evidenceStatus||"未记录"}</p>{old.assessment&&<AssessmentDetails assessment={old.assessment}/>}{(old.evidenceRecords||[]).map(e=><p key={e.id}>{e.direction==="support"?"支持":e.direction==="opposition"?"反向":"边界"}：{e.quote}（{sourceLabel(e.sourceId)}，V{e.hypothesisVersion}）</p>)}{(old.support||[]).map((x,j)=><p key={`s-${j}`}>旧版支持材料：{x}</p>)}{(old.opposition||[]).map((x,j)=><p key={`o-${j}`}>旧版反向材料：{x}</p>)}</details>)}
    </details>
    <div className="next-step"><b>下一步</b> {h.nextStep}</div>
  </article>;
}
