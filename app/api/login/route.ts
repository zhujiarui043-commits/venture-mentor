import { authFailure, signIn } from "@/lib/auth";

export async function POST(request: Request) {
  try { return await signIn(request); }
  catch (error) { return authFailure(error); }
}
