import { getOrCreateProject, ProjectConflictError, saveProject } from "@/lib/store";
import { currentTester, projectIdFor, unauthorized } from "@/lib/auth";
import { applyProposal } from "@/lib/apply-proposal";
import { activeProposal } from "@/lib/proposal-changes";
export async function GET(request: Request) {
  try {
    const tester = await currentTester(request);
    if (!tester) return unauthorized();
    const project = await getOrCreateProject(projectIdFor(tester));
    const pending = activeProposal(project.state);
    if (pending) {
      const artifact = applyProposal(project.state, pending);
      const reply = project.state.messages.findLast(m => m.role === "assistant" && m.content === pending.reply)
        || project.state.messages.findLast(m => m.role === "assistant");
      if (artifact && reply) reply.artifactId = artifact.id;
      return Response.json(await saveProject(project.state, project.revision), { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "无法读取项目" }, { status: error instanceof ProjectConflictError ? 409 : 500 }); }
}
