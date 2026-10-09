import type { FunnelSummary, SurveySummary } from "./types";

// A deliberately narrow format: each row is one ordered stage for the same cohort.
// This avoids inventing a funnel from unrelated survey columns or event totals.
export function summarizeFunnel(input: string): FunnelSummary | null {
  const lines=input.replace(/^\uFEFF/u, "").trim().split(/\r?\n/u).map(line=>line.trim()).filter(Boolean);
  if(lines.length<3 || !/^(?:阶段,人数|stage,count)$/iu.test(lines[0].replace(/\s/g,"")))return null;
  const warnings=["请核对每阶段是同一批对象、相同统计口径，并补充观察周期；仅凭计数无法自动验证这些条件"];
  const stages: FunnelSummary["stages"]=[];
  for(const [i,line] of lines.slice(1,21).entries()){
    const match=line.match(/^([^,\r\n]+),\s*(\d+)\s*$/u);
    if(!match){warnings.push(`第 ${i+2} 行格式无效，未计入漏斗`);continue;}
    const name=match[1].trim(),count=Number(match[2]);
    if(!name||!Number.isSafeInteger(count)){warnings.push(`第 ${i+2} 行人数无效`);continue;}
    if(stages.some(s=>s.name===name)){warnings.push(`阶段“${name}”重复，后续条目未计入`);continue;}
    const previous=stages.at(-1)?.count;
    if(previous!==undefined && count>previous)warnings.push(`“${name}”人数高于上一阶段，请检查是否为同一批对象`);
    const denominator=previous!==undefined&&previous>0&&count<=previous?previous:null;
    stages.push({name,count,fromPrevious:denominator,rate:denominator===null?null:Math.round(count/denominator*10000)/100});
  }
  if(lines.length>21)warnings.push("超过 20 个阶段，仅计算前 20 行");
  return stages.length>=2?{stages,warnings}:null;
}

export function summarizeCsv(input: string): SurveySummary | null {
  const text = input.replace(/^\uFEFF/u, "");
  if (!/[\t,]/u.test(text) || !/[\r\n]/u.test(text)) return null;
  const delimiter = text.split(/\r?\n/u, 1)[0].includes("\t") ? "\t" : ",";
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === delimiter) { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some(value => value)) records.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some(value => value)) records.push(row);
  if (records.length < 2 || records[0].length < 2) return null;
  const header = records[0];
  const warnings: string[] = [];
  if (quoted) warnings.push("存在未闭合的引号，部分单元格可能解析不准确");
  if (header.length > 50) warnings.push("超过 50 列，仅展示前 50 列");
  if (new Set(header).size !== header.length) warnings.push("存在重复列名，请核对问卷变量");
  const rows = records.slice(1, 1001);
  if (records.length > 1001) warnings.push("数据超过 1000 行，本次只预览前 1000 行");
  const irregular = rows.filter(r => r.length !== header.length).length;
  if (irregular) warnings.push(`${irregular} 行列数与表头不一致，尚未自动剔除`);
  const columns = header.slice(0, 50).map((name, index) => {
    const counts = new Map<string, number>(); let missing = 0;
    for (const record of rows) {
      const value = record[index] || "";
      if (!value) missing++;
      else counts.set(value, (counts.get(value) || 0) + 1);
    }
    return {name:name || `第 ${index + 1} 列`,missing,distinct:counts.size,frequencies:[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([value,count])=>({value,count}))};
  });
  warnings.push("仅统计原始记录的描述性频数；尚未核对筛选条件、重复作答或样本代表性");
  return {totalRows:rows.length,columns,warnings};
}
