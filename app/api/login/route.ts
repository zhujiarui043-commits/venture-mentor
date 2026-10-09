import { signIn } from "@/lib/auth";

export async function POST(request: Request) {
  try { return await signIn(request); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "登录失败" }, { status: 500 }); }
}
