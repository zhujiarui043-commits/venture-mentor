import { authFailure, recover } from "@/lib/auth";
export async function POST(request: Request) {
  try { return await recover(request); }
  catch (error) { return authFailure(error); }
}
