"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { extraFieldKeys, fieldLabels, type FieldMeta, type ProjectState } from "@/lib/types";

const groups = [
  { title: "用户与需求", fields: ["audience", "scene", "problem", "alternative"] },
  { title: "方案与商业化", fields: ["solution", "technicalAssumption", "revenue", "channel"] },
  { title: "执行与资源", fields: ["progress", "resources", "constraints"] },
];

// Retain the saved wording and punctuation; only separate explicit points.
function fieldPoints(value: string) {
  const points: string[] = [];
  let start = 0;
  const closing: string[] = [];
  const pairs: Record<string, string> = { "“": "”", "‘": "’", "（": "）", "(": ")", "【": "】", "「": "」" };
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (pairs[char]) closing.push(pairs[char]);
    else if (char === closing.at(-1)) closing.pop();
    if (!closing.length && (char === "；" || char === "\n" || char === "。")) {
      const point = value.slice(start, i + 1).trim();
      if (point) points.push(point);
      start = i + 1;
    }
  }
  const last = value.slice(start).trim();
  if (last) points.push(last);
  return points;
}

function ProjectFieldCard({ label, value, meta }: { label: string; value?: string; meta?: FieldMeta }) {
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const points = value ? fieldPoints(value) : [];
  useEffect(() => {
    const content = contentRef.current;
    if (!content || expanded) return;
    const measure = () => setLong(content.scrollHeight > content.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [value, expanded]);
  return <article className="field-card">
    <div className="field-meta"><h5>{label}</h5>{value && <span className="field-status">{meta?.verification || "未核验"}</span>}</div>
    {value ? <>
      <div ref={contentRef} id={contentId} className={`field-content${!expanded ? " is-collapsed" : ""}`}>
        {points.length > 1 ? <ul>{points.map((point, i) => <li key={i}>{point}</li>)}</ul> : <p>{value}</p>}
      </div>
      <div className="field-footer">
        {long && <button type="button" className="field-expand" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)}>{expanded ? "收起" : "展开全文"}<ChevronDown size={13} /></button>}
        <details className="field-provenance"><summary>记录依据</summary><dl>
          <div><dt>来源</dt><dd>{meta?.origin || "旧记录来源待核"}</dd></div>
          <div><dt>记录状态</dt><dd>{meta?.confirmation || "确认状态待核"}</dd></div>
          <div><dt>核验状态</dt><dd>{meta?.verification || "未核验"}</dd></div>
          {meta?.statementKind && <div><dt>表述性质</dt><dd>{meta.statementKind}</dd></div>}
          {meta?.sourceRef && <div><dt>来源编号</dt><dd>{meta.sourceRef}</dd></div>}
        </dl></details>
      </div>
    </> : <p className="muted">尚未确定</p>}
  </article>;
}

export function ProjectDefinition({ project }: { project: ProjectState }) {
  const card = (id: string) => <ProjectFieldCard key={`${project.id}:${id}`} label={fieldLabels[id]} value={project.fields[id]} meta={project.fieldMeta?.[id]} />;
  return <div className="project-definition">
    {groups.map(group => <section className="definition-group" key={group.title} aria-label={group.title}>
      <h4>{group.title}</h4><div className="field-grid">{group.fields.map(card)}</div>
    </section>)}
    <details className="extra-fields"><summary>角色与问题成本</summary><div className="field-grid">{extraFieldKeys.map(card)}</div></details>
  </div>;
}
