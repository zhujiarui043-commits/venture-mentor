import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,isAbsolute} from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath,pathToFileURL} from "node:url";
import {zipSync,strToU8} from "fflate";
import ts from "typescript";

const root=fileURLToPath(new URL("../",import.meta.url));
const require=createRequire(import.meta.url);
const temp=await mkdtemp(join(tmpdir(),"word-material-"));
try{
  await writeFile(join(temp,"runtime.mjs"),`export const env={SESSION_SECRET:"test-session-secret-of-at-least-24-characters",TEST_ACCESS_CODES:JSON.stringify({owner:"test-access-code-long-enough"})};`);
  for(const [name,path] of Object.entries({types:"lib/types.ts",materials:"lib/materials.ts","attachment-reader":"lib/attachment-reader.ts",auth:"lib/auth.ts","word-material":"lib/word-material.ts",material:"app/api/material/route.ts"})){
    let code=ts.transpileModule(await readFile(join(root,path),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
      .replaceAll('from "cloudflare:workers"','from "./runtime.mjs"')
      .replace(/from "(?:@\/lib\/|\.\/)([a-z-]+)"/gu,'from "./$1.mjs"');
    for(const dependency of ["mammoth","word-extractor","fflate"])code=code.replaceAll(`from "${dependency}"`,`from ${JSON.stringify(pathToFileURL(require.resolve(dependency)).href)}`);
    await writeFile(join(temp,`${name}.mjs`),code);
  }
  const {extractWordMaterial,MAX_WORD_BYTES}=await import(pathToFileURL(join(temp,"word-material.mjs")));
  const {readAttachments}=await import(pathToFileURL(join(temp,"attachment-reader.mjs")));
  const {validateMaterials}=await import(pathToFileURL(join(temp,"materials.mjs")));
  const {POST}=await import(pathToFileURL(join(temp,"material.mjs")));
  const {signIn}=await import(pathToFileURL(join(temp,"auth.mjs")));
  const xmlBody=content=>`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${content}</w:body></w:document>`;
  const makeDocx=body=>zipSync({
    "[Content_Types].xml":strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels":strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml":strToU8(xmlBody(body)),
  });
  const paragraph=text=>`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const bytes=makeDocx(paragraph("大学生访谈记录：整理资料很耗时。")+paragraph("第二段包含 English &amp; 中文。")+'<w:tbl><w:tr><w:tc>'+paragraph("目标用户")+'</w:tc><w:tc>'+paragraph("大学生")+'</w:tc></w:tr></w:tbl>');
  const file=new File([bytes],"访谈.docx");
  const extracted=await extractWordMaterial(file);
  assert.match(extracted.text,/大学生访谈记录/u);
  assert.match(extracted.text,/English & 中文/u);
  assert.match(extracted.text,/目标用户/u);
  assert.match(extracted.text,/大学生/u);
  assert.equal(extracted.name,"访谈.docx");assert.ok(extracted.warnings.length);
  const docBytes=await readFile(join(root,"tests/fixtures/legacy-word.doc"));
  const oldWord=await extractWordMaterial(new File([docBytes],"旧版访谈.doc"));
  assert.ok(oldWord.text.trim().length>10);assert.equal(oldWord.name,"旧版访谈.doc");
  const batch=await readAttachments([file,new File([docBytes],"旧版访谈.doc"),new File(["broken"],"损坏.docx")],[],extractWordMaterial);
  assert.deepEqual(batch.attachments.map(item=>item.name),["访谈.docx","旧版访谈.doc"]);
  assert.equal(batch.errors.length,1);assert.match(batch.errors[0],/损坏.docx/u);
  const extra=await readAttachments([new File(["补充材料"],"补充.txt")],batch.attachments,extractWordMaterial);
  assert.equal(extra.attachments.length,3);assert.equal(extra.attachments[0].text,extracted.text);
  assert.equal(new Set(extra.attachments.map(item=>item.id)).size,3);
  assert.deepEqual(validateMaterials(extra.attachments.map(({name,text})=>({name,text}))).map(item=>item.name),["访谈.docx","旧版访谈.doc","补充.txt"]);
  await assert.rejects(readAttachments(Array.from({length:4},()=>file),batch.attachments,extractWordMaterial),/最多/u);
  assert.throws(()=>validateMaterials([{name:"超限.docx",text:"字".repeat(12001)}]),e=>e.status===413);
  assert.throws(()=>validateMaterials(Array.from({length:4},()=>({name:"满文档.docx",text:"字".repeat(12000)}))),e=>e.status===413);
  const limitBatch=await readAttachments(Array.from({length:4},(_,i)=>new File(["字".repeat(12000)],`材料${i}.txt`)),[],extractWordMaterial);
  assert.equal(limitBatch.attachments.length,3);assert.equal(limitBatch.errors.length,1);
  assert.equal(validateMaterials([{name:"C:\\fakepath\\材料.docx",text:"正文"}])[0].name,"材料.docx");
  const safeText=await extractWordMaterial(new File([makeDocx(paragraph("&lt;script&gt;alert(1)&lt;/script&gt;"))],"文本.docx"));
  assert.equal(safeText.text,"<script>alert(1)</script>");
  const atLimit=await extractWordMaterial(new File([makeDocx(paragraph("字".repeat(12000)))],"完整正文.docx"));
  assert.equal(atLimit.text.length,12000);
  await assert.rejects(extractWordMaterial(new File([makeDocx(paragraph("字".repeat(12001)))],"过长.docx")),e=>e.status===413);
  await assert.rejects(extractWordMaterial(new File([makeDocx("")],"空正文.docx")),e=>e.status===422);
  await assert.rejects(extractWordMaterial(new File([],"空文件.docx")),e=>e.status===400);
  await assert.rejects(extractWordMaterial(new File(["not word"],"损坏.docx")),e=>e.status===415);
  await assert.rejects(extractWordMaterial(new File(["not word"],"损坏.doc")),e=>e.status===415);
  await assert.rejects(extractWordMaterial(new File([bytes],"不支持.pdf")),e=>e.status===415);
  await assert.rejects(extractWordMaterial(new File([new Uint8Array(MAX_WORD_BYTES+1)],"大文件.docx")),e=>e.status===413);
  const expanded=zipSync({"word/document.xml":strToU8("x".repeat(2*1024*1024+1))});
  await assert.rejects(extractWordMaterial(new File([expanded],"压缩超限.docx")),e=>e.status===413);
  await assert.rejects(extractWordMaterial(new File([zipSync({"other.xml":strToU8("not a word file")})],"伪装.docx")),e=>e.status===415);

  const login=await signIn(new Request("http://localhost/api/login",{method:"POST",body:JSON.stringify({code:"test-access-code-long-enough"})}));
  const cookie=login.headers.get("set-cookie").split(";")[0];
  const upload=(file,authenticated=true)=>{const form=new FormData();if(file)form.append("file",file);return new Request("http://localhost/api/material",{method:"POST",headers:authenticated?{cookie}:{},body:form});};
  assert.equal((await POST(upload(file,false))).status,401);
  const response=await POST(upload(file));assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
  assert.equal((await response.json()).text,extracted.text);
  assert.equal((await POST(upload(new File([docBytes],"旧版.doc")))).status,200);
  assert.equal((await POST(upload())).status,400);
  assert.equal((await POST(upload(new File([bytes],"伪装.pdf")))).status,415);
  assert.equal((await POST(new Request("http://localhost/api/material",{method:"POST",headers:{cookie,"content-type":"application/json"},body:"{}"}))).status,400);
  const duplicates=new FormData();duplicates.append("file",file);duplicates.append("file",file);
  assert.equal((await POST(new Request("http://localhost/api/material",{method:"POST",headers:{cookie},body:duplicates}))).status,400);
  const oversizedStream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_WORD_BYTES+100000));controller.close();}});
  assert.equal((await POST(new Request("http://localhost/api/material",{method:"POST",headers:{cookie,"content-type":"multipart/form-data; boundary=test"},body:oversizedStream,duplex:"half"}))).status,413);
  console.log("Word 上传检查通过：中文与表格正文、DOCX与旧版DOC、预览内容、鉴权、损坏文件、字数/文件/解压限制。");
}finally{
  assert.ok(isAbsolute(temp)&&temp.startsWith(join(tmpdir(),"word-material-")));
  await rm(temp,{recursive:true,force:true});
}
