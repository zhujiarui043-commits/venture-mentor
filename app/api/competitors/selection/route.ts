import { currentTester, projectIdFor, unauthorized } from "@/lib/auth";
import { setCompetitionRetention } from "@/lib/competition-workspace";
import { getProject, ProjectConflictError, saveProject } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const tester = await currentTester(request);
    if (!tester) return unauthorized();
    const body = await request.json() as {projectId: string; artifactId: string; competitorIndex: number; retained: boolean; revision: number};
    if (!body || typeof body !== "object" || typeof body.projectId !== "string"
      || typeof body.artifactId !== "string" || !Number.isSafeInteger(body.competitorIndex) || body.competitorIndex < 0
      || typeof body.retained !== "boolean" || !Number.isSafeInteger(body.revision) || body.revision < 0)
      return Response.json({error: "请求参数不正确"}, {status: 400});
    if (body.projectId !== projectIdFor(tester)) return Response.json({error: "无权访问该项目"}, {status: 403});
    const project = await getProject(body.projectId);
    if (!project) return Response.json({error: "项目不存在"}, {status: 404});
    if (body.revision !== project.revision) throw new ProjectConflictError();
    if (!setCompetitionRetention(project.state, body, body.retained))
      return Response.json({error: "竞品结果已更新，请刷新后重新选择。"}, {status: 409});
    return Response.json(await saveProject(project.state, project.revision), {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    return Response.json({error: error instanceof SyntaxError ? "请求参数不正确" : error instanceof Error ? error.message : "保存选择失败"},
      {status: error instanceof ProjectConflictError ? 409 : error instanceof SyntaxError ? 400 : 500});
  }
}
