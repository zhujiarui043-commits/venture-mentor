import { getProject, ProjectConflictError, saveProject } from "@/lib/store";
import { currentTester, projectIdFor, unauthorized } from "@/lib/auth";
import { attachEvidenceToVersion, isSubstantiveRevision } from "@/lib/hypothesis";
import { proposalChanges } from "@/lib/proposal-changes";
import { numberAnalysisRecords } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const tester = await currentTester(request);
    if (!tester) return unauthorized();
    const {projectId,proposalId,accept} = await request.json() as {projectId:string;proposalId:string;accept:boolean};
    if (projectId !== projectIdFor(tester)) return Response.json({error:"无权访问该项目"},{status:403});
    const project = await getProject(projectId);
    if(!project || !project.state.pending || project.state.pending.id!==proposalId) return Response.json({error:"待确认内容已更新，请刷新"},{status:409});
    const state=project.state, p=proposalChanges(state,state.pending!);
    if(accept){
      for(const field of p.fieldRemovals || []) {
        delete state.fields[field];
        delete state.fieldStatuses?.[field];
        delete state.fieldMeta?.[field];
      }
      Object.assign(state.fields,p.fields);
      state.fieldStatuses ||= {};
      Object.assign(state.fieldStatuses,p.fieldStatuses || {});
      state.fieldMeta ||= {};
      const confirmedAt=new Date().toISOString();
      for(const field of Object.keys(p.fields)) {
        const meta=p.fieldMeta?.[field];
        state.fieldMeta[field]={
          origin:meta?.origin || "旧记录来源待核",
          statementKind:meta?.statementKind || "未区分",
          confirmation:"用户已确认",
          verification:meta?.verification || "未核验",
          ...(meta?.sourceRef?{sourceRef:meta.sourceRef}:{}),
          updatedAt:confirmedAt,
        };
      }
      if(!state.rawIdea || /^(你好|您好|嗨|哈喽|hi|hello|hey|在吗)[!！。.?？\s]*$/i.test(state.rawIdea)) {
        const idea = state.messages.find(m => m.role === "user" && m.content.trim().length >= 8 && /想做|打算做|计划做|做一个|开发|创业|项目|产品|服务|帮助|解决|平台|网页|应用/i.test(m.content));
        if(idea) state.rawIdea = idea.content;
      }
      if(p.projectTitle?.trim()) state.title=p.projectTitle.trim().slice(0,32);
      const revisedVersions=new Map<string,number>();
      if(p.hypothesis){
        const target=state.hypotheses.find(h=>h.id===p.hypothesis?.targetId);
        if(target){
          const textChanged=target.text.trim()!==p.hypothesis.text.trim();
          const substantive=isSubstantiveRevision(target,p.hypothesis);
          if(substantive){
            revisedVersions.set(target.id,target.version);
            target.history.push({version:target.version,text:target.text,reason:"用户确认修订",at:confirmedAt,category:target.category,stage:target.stage,evidenceStatus:target.evidenceStatus,priority:target.priority,nextStep:target.nextStep,support:[...target.support],opposition:[...target.opposition],evidenceRecords:[...(target.evidenceRecords || [])],processLabel:target.processLabel});
            target.version++;
            target.support=[];target.opposition=[];target.evidenceRecords=[];
            target.stage="待探索";target.evidenceStatus="未进入验证";target.processLabel="已修订";
          }else if(textChanged){
            target.editHistory ||= [];
            target.editHistory.push({previousText:target.text,at:confirmedAt,reason:"用户确认措辞调整"});
          }
          target.text=p.hypothesis.text;target.category=p.hypothesis.category;target.priority=p.hypothesis.priority;target.nextStep=p.hypothesis.nextStep;
        }
        else { const num=state.hypotheses.reduce((max,h)=>Math.max(max,Number(h.id.slice(1))||0),0)+1;
          state.hypotheses.push({id:`H${String(num).padStart(2,"0")}`,version:1,text:p.hypothesis.text,category:p.hypothesis.category,priority:p.hypothesis.priority,nextStep:p.hypothesis.nextStep,stage:"待探索",evidenceStatus:"未进入验证",support:[],opposition:[],evidenceRecords:[],history:[]}); }
      }
      // Resolve each quote after the revision, against the version shown in the proposal.
      for(const item of p.evidence){
        const h=state.hypotheses.find(h=>h.id===item.hypothesisId);
        const material=state.materials?.find(m=>m.id===item.source);
        if(h&&material)attachEvidenceToVersion(h,item,material,confirmedAt,revisedVersions.get(h.id));
      }
      if(p.artifact){
        const old=state.artifacts.filter(a=>a.section===p.artifact?.section && (p.artifact?.diagnosis||p.artifact?.canvas||p.artifact?.competition?true:p.artifact?.mvp?!!a.mvp:a.title===p.artifact?.title));
        const previous=old.at(-1)?.diagnosis;
        if(p.artifact.diagnosis && previous)p.artifact.diagnosis.changes=p.artifact.diagnosis.dimensions.flatMap(d=>{
          const prior=previous.dimensions.find(x=>x.name===d.name);
          return prior && (prior.attention!==d.attention || prior.judgment!==d.judgment)?[{name:d.name,previous:prior.attention,current:d.attention}]:[];
        });
        const priorCanvas=old.at(-1)?.canvas;
        if(p.artifact.canvas&&priorCanvas)p.artifact.canvas.changes=p.artifact.canvas.modules.flatMap(d=>{
          const prior=priorCanvas.modules.find(x=>x.name===d.name);
          return prior&&prior.content!==d.content?[{name:d.name,previous:prior.content,current:d.content}]:[];
        });
        state.artifacts = numberAnalysisRecords([...state.artifacts, {...p.artifact,id:crypto.randomUUID(),version:old.reduce((max,a)=>Math.max(max,a.version),0)+1,createdAt:confirmedAt}]);
      }
    }
    state.pending=null;
    return Response.json(await saveProject(state,project.revision));
  }catch(error){return Response.json({error:error instanceof Error?error.message:"保存失败"},{status:error instanceof ProjectConflictError?409:500});}
}
