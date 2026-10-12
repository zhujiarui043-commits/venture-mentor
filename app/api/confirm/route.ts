import { getProject, ProjectConflictError, saveProject } from "@/lib/store";
import { currentTester, projectIdFor, unauthorized } from "@/lib/auth";
import { applyProposal } from "@/lib/apply-proposal";
import { proposalChanges } from "@/lib/proposal-changes";

export async function POST(request: Request) {
  try {
    const tester = await currentTester(request);
    if (!tester) return unauthorized();
    const {projectId,proposalId,accept} = await request.json() as {projectId:string;proposalId:string;accept:boolean};
    if (projectId !== projectIdFor(tester)) return Response.json({error:"无权访问该项目"},{status:403});
    const project = await getProject(projectId);
    if(!project || !project.state.pending || project.state.pending.id!==proposalId) return Response.json({error:"待确认内容已更新，请刷新"},{status:409});
    const state=project.state, p=proposalChanges(state,state.pending!);
    if(accept) applyProposal(state,p,"confirmed");
    state.pending=null;
    return Response.json(await saveProject(state,project.revision));
  }catch(error){return Response.json({error:error instanceof Error?error.message:"保存失败"},{status:error instanceof ProjectConflictError?409:500});}
}
