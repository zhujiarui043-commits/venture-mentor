import { authFailure, signOut } from "@/lib/auth";
export async function POST(request: Request) {
  try { return await signOut(request); }
  catch (error) { return authFailure(error); }
}
