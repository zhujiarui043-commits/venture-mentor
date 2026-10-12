import assert from "node:assert/strict";
import {mkdtemp, readFile, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const temp = await mkdtemp(join(tmpdir(), "mentor-markdown-"));
try {
  for (const name of ["message-content", "source-links"]) {
    let code = ts.transpileModule(await readFile(join(root, "components", name + ".tsx"), "utf8"), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    for (const dependency of ["react/jsx-runtime", "react-markdown", "remark-gfm"]) code = code.replaceAll(`from "${dependency}"`, `from ${JSON.stringify(pathToFileURL(require.resolve(dependency)).href)}`);
    code = code.replace('from "./source-links"', 'from "./source-links.mjs"');
    await writeFile(join(temp, name + ".mjs"), code);
  }
  const {MessageContent} = await import(pathToFileURL(join(temp, "message-content.mjs")));
  const render = content => renderToStaticMarkup(createElement(MessageContent, {content}));
  const html = render("## 启动条件\n\n先给结论：**现在还不能启动正式问卷**。M08 生日聚会**有**浅色 dress code。\n\n| 条件 | 现状 | 是否满足 |\n| --- | --- | --- |\n| 用户明确 | 学生或年轻人 | 满足 |\n| 问题类别 | 仅 M08 接近核心对象 | 不满足 |\n\n1. 补充访谈\n2. 核对变量\n\n- 继续探索\n\n[来源](https://example.com/source)");
  assert.ok(html.includes("<h2>启动条件</h2>"));
  assert.ok(html.includes("<strong>现在还不能启动正式问卷</strong>"));
  assert.ok(html.includes("<strong>有</strong>浅色"));
  assert.ok(!html.includes("**"));
  assert.ok(html.includes('<div class="markdown-table-scroll" role="region"') && html.includes("<table>"));
  assert.equal((html.match(/<th>/g)||[]).length,3);
  assert.equal((html.match(/<td>/g)||[]).length,6);
  assert.ok(html.includes("<ol>") && html.includes("<ul>"));
  assert.ok(html.includes('href="https://example.com/source"') && html.includes('rel="noopener noreferrer"'));
  const unsafe = render('[危险链接](javascript:alert%281%29)\n\n<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>\n\n![材料图片](https://example.com/tracker.png)');
  assert.ok(!unsafe.includes("href=") && !unsafe.includes("<script") && !unsafe.includes("<img") && !unsafe.includes("onerror"));
  assert.ok(unsafe.includes("材料图片"));
  assert.ok(render("未闭合的 **加粗与 | 普通竖线").includes("普通竖线"));
  console.log("Markdown 检查通过：中文加粗、表格、标题、列表、来源链接与安全渲染。");
} finally {
  await rm(temp, {recursive:true,force:true});
}
