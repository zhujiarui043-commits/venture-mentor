"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { isDiagnosisScore, type DiagnosisDimension } from "@/lib/types";

const labels = ["目标用户", "痛点真实", "痛点强度", "方案匹配", "竞品差异", "付费可能", "获客渠道", "执行能力"];

export function DiagnosisRadar({dimensions, disabled, onGenerate}: {
  dimensions: Pick<DiagnosisDimension, "name" | "score">[];
  disabled: boolean;
  onGenerate: () => void;
}) {
  const scoredCount = dimensions.filter(d => isDiagnosisScore(d.score)).length;
  const complete = dimensions.length === 8 && scoredCount === 8;
  const data = dimensions.map((d, i) => ({dimension: labels[i], value: d.score}));
  return <div className="diagnosis-radar">
    <div className="diagnosis-radar-heading"><h3>八维评分分布</h3><span>{scoredCount} / 8 个维度已评分 · 0–4 分</span></div>
    {complete ? <div className="diagnosis-radar-plot" role="img" aria-label={`八维评分：${dimensions.map(d => `${d.name} ${d.score}分${d.score === 0 ? "，暂无法判断" : ""}`).join("；")}。分值不代表项目成功概率。`}>
      <ResponsiveContainer width="100%" height="100%"><RadarChart data={data} outerRadius="61%" accessibilityLayer={false}>
        <PolarGrid stroke="var(--border)"/>
        <PolarAngleAxis dataKey="dimension" tick={{fill:"var(--muted-foreground)",fontSize:14}}/>
        <PolarRadiusAxis type="number" domain={[0,4]} tickCount={5} angle={90} axisLine={false} tick={{fill:"var(--muted-foreground)",fontSize:12}}/>
        <Radar dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.16} strokeWidth={2} dot={{r:3,fill:"var(--primary)"}} activeDot={false} isAnimationActive={false}/>
      </RadarChart></ResponsiveContainer>
    </div> : <div className="diagnosis-radar-unscored"><p>{scoredCount ? "这份诊断的评分尚不完整。" : "这份诊断尚未按新标准评分。"}重新生成八维诊断后显示雷达图。</p><Button variant="outline" disabled={disabled} onClick={onGenerate}>按新标准生成诊断</Button></div>}
    <details className="diagnosis-score-rules"><summary>查看评分标准</summary><p className="diagnosis-radar-note">0 分：信息缺失，暂无法判断；1 分：初步设想；2 分：具体判断；3 分：材料支持；4 分：证据充分，可支持下一步决策。分值反映当前的明确、验证和可执行程度，不代表项目成功概率。</p><p>每个维度取完整满足的最高等级。信息不足与低表现分别判断；分值、关注级别和处理优先级分别记录。矛盾材料需说明分歧和置信程度。</p><div className="diagnosis-score-table"><table><thead><tr><th>维度</th><th>1 分</th><th>2 分</th><th>3 分</th><th>4 分</th></tr></thead><tbody>{scoreCriteria.map(row => <tr key={row[0]}>{row.map((text, i) => i === 0 ? <th scope="row" key={i}>{text}</th> : <td key={i}>{text}</td>)}</tr>)}</tbody></table></div></details>
  </div>;
}

const scoreCriteria = [
  ["目标用户明确度", "仅描述宽泛人群", "已明确部分特征或使用情境", "用户范围、情境和筛选条件较清楚", "用户边界清晰，并得到真实材料支持"],
  ["痛点真实性", "主要来自创业者设想", "有个别案例或间接材料", "多名目标用户报告过具体经历", "访谈、行为或其他材料反复证明问题真实存在"],
  ["痛点强度", "不清楚问题造成什么影响", "能说明部分不便或成本", "问题频繁发生或造成明显时间、金钱、情绪成本", "用户已主动投入较高成本解决，或问题明显影响关键任务"],
  ["解决方案匹配度", "只有功能设想", "能解释功能与痛点的基本关系", "目标用户能够理解方案并认可其用途", "原型、任务或实际使用结果表明方案能改善核心问题"],
  ["竞品差异化", "不清楚相关产品", "已识别部分竞品或替代方式", "已明确主要差异及竞品不足", "差异对应真实未满足需求，并获得用户或市场材料支持"],
  ["付费可能性", "只有用户可能愿意付费的推测", "已提出价格或付费对象", "用户表达具体付费条件，或存在相近消费行为", "出现订金、预购、真实付款或其他强付费信号"],
  ["获客可行性", "不清楚在哪里接触用户", "已提出可能的渠道", "已明确渠道、触达方式和基本成本", "已实际触达并获得稳定、可重复的响应"],
  ["执行可行性", "只有整体想法", "已初步考虑人员、技术、时间或资源", "核心任务、资源需求和限制基本明确", "已完成关键原型或验证任务，现有条件能够推进下一阶段"],
];
