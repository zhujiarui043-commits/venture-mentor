import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { emptyProject, numberAnalysisRecords, type ProjectState } from "./types";
import { activeProposal } from "./proposal-changes";

function readState(json: string): ProjectState {
  const state = JSON.parse(json) as ProjectState;
  return {...state, artifacts: numberAnalysisRecords(state.artifacts), pending: activeProposal(state)};
}

export async function getProject(id: string) {
  const [row] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ? { state: readState(row.state), revision: row.revision } : null;
}
export async function getOrCreateProject(id: string) {
  const [row] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  if (row) return { state: readState(row.state), revision: row.revision };
  const state = emptyProject(id);
  await getDb().insert(projects).values({ id: state.id, title: state.title, state: JSON.stringify(state), updatedAt: state.updatedAt }).onConflictDoNothing();
  return (await getProject(id))!;
}
export async function saveProject(state: ProjectState, revision: number) {
  state.artifacts = numberAnalysisRecords(state.artifacts);
  state.updatedAt = new Date().toISOString();
  const updated = await getDb().update(projects).set({
    title: state.title, state: JSON.stringify(state), revision: revision + 1, updatedAt: state.updatedAt,
  }).where(and(eq(projects.id, state.id), eq(projects.revision, revision))).returning({ revision: projects.revision });
  if (updated.length !== 1) throw new ProjectConflictError();
  return { state, revision: revision + 1 };
}

export class ProjectConflictError extends Error {
  constructor() { super("项目已在另一页面更新，请刷新页面查看最新内容后重试。"); }
}
