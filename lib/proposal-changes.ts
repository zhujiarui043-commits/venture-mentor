import type { ProjectState, Proposal } from "./types";

function normalizedText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

// Compare against saved records without changing their wording or provenance.
export function proposalChanges(state: ProjectState, proposal: Proposal): Proposal {
  const fields = Object.fromEntries(Object.entries(proposal.fields).filter(([key, value]) =>
    value.trim() && normalizedText(value) !== normalizedText(state.fields[key] || "")
  ));
  const projectTitle = proposal.projectTitle?.trim().slice(0, 32);
  return {
    ...proposal,
    fields,
    fieldStatuses: Object.fromEntries(Object.entries(proposal.fieldStatuses || {}).filter(([key]) => key in fields)),
    fieldMeta: Object.fromEntries(Object.entries(proposal.fieldMeta || {}).filter(([key]) => key in fields)),
    fieldRemovals: [...new Set(proposal.fieldRemovals || [])].filter(key =>
      key in state.fields && !(key in proposal.fields)
    ),
    projectTitle: projectTitle && normalizedText(projectTitle) !== normalizedText(state.title) ? projectTitle : undefined,
  };
}

export function hasProposalChanges(proposal: Proposal): boolean {
  return !!(Object.keys(proposal.fields).length || proposal.fieldRemovals?.length || proposal.projectTitle || proposal.artifact || proposal.hypothesis || proposal.evidence.length);
}
