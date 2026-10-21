import { attachEvidenceToVersion, isSubstantiveRevision, validateHypothesisUpdates } from "./hypothesis";
import { proposalChanges } from "./proposal-changes";
import { syncCompetitionWorkspace } from "./competition-workspace";
import { applyHypothesisAssessments, validateHypothesisAssessments } from "./hypothesis-assessment";
import { analysisRecordTitle, isDiagnosisScore, nextArtifactVersion, numberAnalysisRecords, type ProjectState, type Proposal } from "./types";

// A successful turn updates every view from the same persisted project state.
export function applyProposal(state: ProjectState, proposal: Proposal, mode: "automatic" | "confirmed" = "automatic") {
  const p = proposalChanges(state, structuredClone(proposal));
  if (p.hypothesisUpdates?.length) validateHypothesisUpdates(state,p.hypothesisUpdates);
  if (p.hypothesisAssessments?.length) validateHypothesisAssessments(state,p.hypothesisAssessments);
  const recordedAt = new Date().toISOString();
  for(const field of p.fieldRemovals || []) {
    delete state.fields[field];
    delete state.fieldStatuses?.[field];
    delete state.fieldMeta?.[field];
  }
  Object.assign(state.fields,p.fields);
  state.fieldStatuses ||= {};
  Object.assign(state.fieldStatuses,p.fieldStatuses || {});
  state.fieldMeta ||= {};

  for(const field of Object.keys(p.fields)) {
    const meta=p.fieldMeta?.[field];
    state.fieldMeta[field]={
      origin:meta?.origin || "旧记录来源待核",
      statementKind:meta?.statementKind || "未区分",
      confirmation:mode === "confirmed" ? "用户已确认" : "自动记录",
      verification:meta?.verification || "未核验",
      ...(meta?.sourceRef?{sourceRef:meta.sourceRef}:{}),
      updatedAt:recordedAt,
    };
  }
  if(!state.rawIdea || /^(你好|您好|嗨|哈喽|hi|hello|hey|在吗)[!！。.?？\s]*$/i.test(state.rawIdea)) {
    const idea = state.messages.find(m => m.role === "user" && m.content.trim().length >= 8 && /想做|打算做|计划做|做一个|开发|创业|项目|产品|服务|帮助|解决|平台|网页|应用/i.test(m.content));
    if(idea) state.rawIdea = idea.content;
  }
  if(p.projectTitle?.trim()) state.title=p.projectTitle.trim().slice(0,32);
  // Assessments refer to the version reviewed before this turn's text revision.
  // Apply them first so a substantive revision archives them with that version.
  if (p.hypothesisAssessments?.length) applyHypothesisAssessments(state,p.hypothesisAssessments,recordedAt);
  const revisedVersions=new Map<string,number>();
  const hypothesisChanges: NonNullable<Proposal["hypothesis"]>[] = [p.hypothesis, ...(p.hypotheses || [])].filter((item): item is NonNullable<Proposal["hypothesis"]> => !!item);
  for (const hypothesis of hypothesisChanges) {
    const target=state.hypotheses.find(h=>h.id===hypothesis.targetId);
    if(target){
      const textChanged=target.text.trim()!==hypothesis.text.trim();
      const substantive=isSubstantiveRevision(target,hypothesis);
      if(substantive){
        revisedVersions.set(target.id,target.version);
        target.history.push({version:target.version,text:target.text,reason:mode === "confirmed" ? "用户确认修订" : "对话同步修订",at:recordedAt,category:target.category,stage:target.stage,evidenceStatus:target.evidenceStatus,priority:target.priority,nextStep:target.nextStep,support:[...target.support],opposition:[...target.opposition],evidenceRecords:[...(target.evidenceRecords || [])],processLabel:target.processLabel,assessment:target.assessment,assessmentHistory:target.assessmentHistory});
        target.version++;
        target.support=[];target.opposition=[];target.evidenceRecords=[];
        delete target.assessment; target.assessmentHistory=[];
        target.stage="待探索";target.evidenceStatus="未进入验证";target.processLabel="已修订";
      }else if(textChanged){
        target.editHistory ||= [];
        target.editHistory.push({previousText:target.text,at:recordedAt,reason:mode === "confirmed" ? "用户确认措辞调整" : "对话同步措辞调整"});
      }
      target.text=hypothesis.text;target.category=hypothesis.category;target.priority=hypothesis.priority;target.nextStep=hypothesis.nextStep;
    }
    else { const num=state.hypotheses.reduce((max,h)=>Math.max(max,Number(h.id.slice(1))||0),0)+1;
      state.hypotheses.push({id:`H${String(num).padStart(2,"0")}`,version:1,text:hypothesis.text,category:hypothesis.category,priority:hypothesis.priority,nextStep:hypothesis.nextStep,stage:"待探索",evidenceStatus:"未进入验证",support:[],opposition:[],evidenceRecords:[],history:[]}); }
  }
  // Resolve each quote after the revision, against the version shown in the proposal.
  for(const item of p.evidence){
    const h=state.hypotheses.find(h=>h.id===item.hypothesisId);
    const message=state.messages.find(m=>m.id===item.source && m.role==="user");
    const material=state.materials?.find(m=>m.id===item.source) || (message ? {id:item.source,content:message.content,at:message.at} : undefined);
    if(h&&material)attachEvidenceToVersion(h,item,material,recordedAt,revisedVersions.get(h.id));
  }
  for (const update of p.hypothesisUpdates || []) {
    const h = state.hypotheses.find(h => h.id === update.hypothesisId)!;
    if (h.priority !== update.priority) {
      h.priorityHistory ||= [];
      h.priorityHistory.push({hypothesisVersion:h.version,previous:h.priority,current:update.priority,rationale:update.rationale,at:recordedAt});
    }
    h.priority = update.priority;
    h.priorityRationale = update.rationale;
    h.nextStep = update.nextStep;
  }
  if(p.artifact){
    p.artifact.title = analysisRecordTitle(p.artifact);
    const version = nextArtifactVersion(state.artifacts, p.artifact);
    const old=state.artifacts.filter(a=>a.section===p.artifact?.section && (p.artifact?.diagnosis||p.artifact?.canvas||p.artifact?.competition?true:p.artifact?.mvp?!!a.mvp:analysisRecordTitle(a)===p.artifact?.title));
    const previous=old.at(-1)?.diagnosis;
    if(p.artifact.diagnosis && previous)p.artifact.diagnosis.changes=p.artifact.diagnosis.dimensions.flatMap(d=>{
      const prior=previous.dimensions.find(x=>x.name===d.name);
      return prior && (prior.attention!==d.attention || prior.judgment!==d.judgment || prior.score!==d.score)?[{
        name:d.name,previous:prior.attention,current:d.attention,
        ...(isDiagnosisScore(prior.score)?{previousScore:prior.score}:{}),
        ...(isDiagnosisScore(d.score)?{currentScore:d.score}:{}),
        triggerRefs:d.scoreTriggerRefs || [],
      }]:[];
    });
    const priorCanvas=old.at(-1)?.canvas;
    if(p.artifact.canvas&&priorCanvas)p.artifact.canvas.changes=p.artifact.canvas.modules.flatMap(d=>{
      const prior=priorCanvas.modules.find(x=>x.name===d.name);
      return prior&&prior.content!==d.content?[{name:d.name,previous:prior.content,current:d.content}]:[];
    });
    const artifact = {...p.artifact,id:p.id,version,createdAt:recordedAt};
    syncCompetitionWorkspace(state, artifact, !!p.webSearch);
    state.artifacts = numberAnalysisRecords([...state.artifacts, artifact]);
  }
  state.pending = null;
  return p.artifact ? state.artifacts.find(a => a.id === p.id) : undefined;
}
