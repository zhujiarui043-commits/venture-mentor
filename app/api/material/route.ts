import { currentTester, unauthorized } from "@/lib/auth";
import { extractWordMaterial, MaterialError, MAX_WORD_BYTES } from "@/lib/word-material";
import { extractExcelMaterial, MAX_EXCEL_BYTES } from "@/lib/excel-material";

async function boundedFormData(request: Request): Promise<FormData> {
  const maxRequestBytes = Math.max(MAX_WORD_BYTES,MAX_EXCEL_BYTES) + 64 * 1024;
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data;")) throw new MaterialError("请通过附材料按钮上传 Word 或 Excel 文件。", 400);
  if (Number(request.headers.get("content-length") || 0) > maxRequestBytes) throw new MaterialError("上传内容超过 5 MB，请缩小文件后重试。", 413);
  if (!request.body) throw new MaterialError("请选择要上传的 Word 或 Excel 文件。", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxRequestBytes) {
        await reader.cancel();
        throw new MaterialError("上传内容超过 5 MB，请缩小文件后重试。", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try { return await new Response(bytes,{headers:{"content-type":contentType}}).formData(); }
  catch { throw new MaterialError("上传格式不正确，请重新选择文件。",400); }
}

export async function POST(request: Request) {
  try {
    if (!await currentTester(request)) return unauthorized();
    const form = await boundedFormData(request);
    const files = form.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) throw new MaterialError("请每次选择一个 Word 或 Excel 文件。", 400);
    const file=files[0], result=/\.xlsx?$/iu.test(file.name) ? await extractExcelMaterial(file) : await extractWordMaterial(file);
    return Response.json(result,{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    return Response.json({error:error instanceof MaterialError?error.message:"读取材料失败，请重新选择文件。"},{status:error instanceof MaterialError?error.status:500,headers:{"Cache-Control":"no-store"}});
  }
}
