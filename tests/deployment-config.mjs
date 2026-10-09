import assert from "node:assert/strict";
import {mkdtemp, mkdir, writeFile, rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join, isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";

const script = fileURLToPath(new URL("../scripts/read-deployment-id.mjs", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "mentor-deployment-"));
const sourceId = "12345678-1234-4321-9876-123456789012";
const builtId = "23456789-1234-4321-9876-123456789012";
const readId = (...args) => spawnSync(process.execPath, [script, "--project-root", temp, ...args], {encoding:"utf8"});
try {
  assert.notEqual(readId().status,0);
  await mkdir(join(temp,"config"));
  await writeFile(join(temp,"config/deployment.json"),JSON.stringify({d1DatabaseId:sourceId}));
  assert.equal(readId().stdout.trim(),sourceId);
  assert.notEqual(readId("--built-only").status,0);
  await mkdir(join(temp,"dist/server"),{recursive:true});
  await writeFile(join(temp,"dist/server/wrangler.json"),JSON.stringify({d1_databases:[{database_id:builtId}]}));
  assert.equal(readId().stdout.trim(),builtId);
  assert.equal(readId("--built-only").stdout.trim(),builtId);
  for(const database_id of ["", "invalid", "00000000-0000-4000-8000-000000000000"]) {
    await writeFile(join(temp,"dist/server/wrangler.json"),JSON.stringify({d1_databases:[{database_id}]}));
    assert.notEqual(readId().status,0);
    assert.equal(readId().stdout,"");
  }
  console.log("部署配置检查通过：全新克隆读取源码配置，已有部署优先保留构建数据库，缺失/占位配置阻止部署。");
} finally {
  assert.ok(isAbsolute(temp)&&temp.startsWith(join(tmpdir(),"mentor-deployment-")));await rm(temp,{recursive:true,force:true});
}
