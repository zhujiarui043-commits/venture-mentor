import { authFailure, register } from "@/lib/auth";
export async function POST(request: Request) {
  try { return await register(request); }
  catch (error) { return authFailure(error); }
}
