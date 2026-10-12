import type { ProjectState } from "./types";

// Summarize the current definition without repeating the solution's feature list.
function brief(value: string | undefined, limit: number) {
  const firstPoint = (value || "").trim().split(/[。！？；\n]/u)[0]
    .replace(/\s+/gu, " ").replace(/[，,、：:；;。.!！?？]+$/u, "").trim();
  const chars = Array.from(firstPoint);
  if (chars.length <= limit) return firstPoint;
  return chars.slice(0, limit - 1).join("").replace(/[，,、：:；;]+$/u, "") + "…";
}

export function projectSummary(project: ProjectState): string {
  const audience = brief(project.fields.audience, 32).replace(/^(?:目标用户(?:是|为|：|:)?|面向|针对|服务于)\s*/u, "");
  const problem = brief(project.fields.problem, 52).replace(/^(?:核心问题(?:是|为|：|:)?|要解决的问题(?:是|为|：|:)?)\s*/u, "");
  if (audience && problem) return `面向${audience}，聚焦${problem}。`;
  if (problem) return `聚焦${problem}，具体服务对象仍在梳理中。`;
  if (audience) return `面向${audience}，具体需求与项目方向仍在梳理中。`;

  const idea = brief(project.rawIdea, 88);
  const solution = brief(project.fields.solution, 88);
  if (idea && idea !== solution) return /…$/u.test(idea) ? idea : `${idea}。`;
  return project.title && project.title !== "未命名项目"
    ? `${brief(project.title, 32)}，服务对象与核心需求仍在梳理中。`
    : "项目方向尚在梳理中，和导师聊聊你想帮助谁、解决什么问题。";
}
