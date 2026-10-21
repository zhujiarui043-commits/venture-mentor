import type { ProjectState } from "./types";

// Keep the saved meaning intact; concise wording is handled when fields are generated.
function summaryPart(value: string | undefined) {
  return (value || "").trim().replace(/\s+/gu, " ")
    .replace(/[，,、：:；;。.!！?？]+$/u, "").trim();
}

export function projectSummary(project: ProjectState): string {
  const audience = summaryPart(project.fields.audience).replace(/^(?:目标用户(?:是|为|：|:)?|面向|针对|服务于)\s*/u, "");
  const problem = summaryPart(project.fields.problem).replace(/^(?:核心问题(?:是|为|：|:)?|要解决的问题(?:是|为|：|:)?)\s*/u, "");
  if (audience && problem) return `面向${audience}，聚焦${problem}。`;
  if (problem) return `聚焦${problem}，具体服务对象仍在梳理中。`;
  if (audience) return `面向${audience}，具体需求与项目方向仍在梳理中。`;

  const idea = summaryPart(project.rawIdea);
  const solution = summaryPart(project.fields.solution);
  if (idea && idea !== solution) return `${idea}。`;
  return project.title && project.title !== "未命名项目"
    ? `${summaryPart(project.title)}，服务对象与核心需求仍在梳理中。`
    : "项目方向尚在梳理中，和导师聊聊你想帮助谁、解决什么问题。";
}
