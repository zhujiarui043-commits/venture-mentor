import type { Hypothesis, ProjectState, Proposal } from "./types";

export function isSubstantiveRevision(target: Hypothesis, change: NonNullable<Proposal["hypothesis"]>) {
  return target.category !== change.category || (target.text.trim() !== change.text.trim() && change.changeKind !== "措辞调整");
}

export function evidenceVersionTarget(target: Hypothesis, change: Proposal["hypothesis"], requested?: "current" | "revised"): "current" | "revised" {
  return requested === "revised" && change?.targetId === target.id && isSubstantiveRevision(target, change) ? "revised" : "current";
}

export function attachEvidenceToVersion(h: Hypothesis, item: Proposal["evidence"][number], material: ProjectState["materials"][number], at: string, oldVersion?: number) {
  if (!material.content.includes(item.quote) || (item.hypothesisVersion !== undefined && item.hypothesisVersion !== (oldVersion ?? h.version))) return false;
  const useRevised = item.versionTarget === "revised" && oldVersion !== undefined;
  const version = oldVersion !== undefined && !useRevised ? oldVersion : h.version;
  const records = oldVersion !== undefined && !useRevised
    ? h.history.findLast(entry => entry.version === oldVersion)
    : h;
  if (!records) return false;
  records.evidenceRecords ||= [];
  records.evidenceRecords.push({
    id:crypto.randomUUID(), hypothesisVersion:version, direction:item.direction, quote:item.quote,
    sourceId:item.source, sourceLocation:`字符 ${material.content.indexOf(item.quote)+1}`, recordedAt:at,
  });
  return true;
}
