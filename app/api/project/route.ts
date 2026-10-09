import { getOrCreateProject } from "@/lib/store";
import { currentTester, projectIdFor, unauthorized } from "@/lib/auth";
export async function GET(request: Request) {
  try {
    const tester = await currentTester(request);
    if (!tester) return unauthorized();
    return Response.json(await getOrCreateProject(projectIdFor(tester)), { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "无法读取项目" }, { status: 500 }); }
}
