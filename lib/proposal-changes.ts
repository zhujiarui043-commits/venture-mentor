import { analysisRecordTitle, type ProjectState, type Proposal } from "./types";

function normalizedText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

// Compare against saved records without changing their wording or provenance.
export function proposalChanges(state: ProjectState, proposal: Proposal): Proposal {
  const fields = Object.fromEntries(Object.entries(proposal.fields).filter(([key, value]) =>
    value.trim() && (normalizedText(value) !== normalizedText(state.fields[key] || "") ||
      (state.pending && state.pending.id !== proposal.id && key in state.pending.fields && normalizedText(value) !== normalizedText(state.pending.fields[key])))
  ));
  const projectTitle = proposal.projectTitle?.trim().slice(0, 32);
  return {
    ...proposal,
    artifact: proposal.artifact ? {...proposal.artifact, title: analysisRecordTitle(proposal.artifact)} : null,
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
  return !!(Object.keys(proposal.fields).length || proposal.fieldRemovals?.length || proposal.projectTitle || proposal.artifact || proposal.hypothesis || proposal.evidence.length || proposal.hypothesisAssessments?.length || proposal.hypothesisUpdates?.length);
}

export function activeProposal(state: ProjectState): Proposal | null {
  if (!state.pending) return null;
  const proposal = proposalChanges(state, {...state.pending, fields: state.pending.fields || {},
    artifact: state.pending.artifact || null, hypothesis: state.pending.hypothesis || null, evidence: state.pending.evidence || []});
  return hasProposalChanges(proposal) ? proposal : null;
}

// Chat can continue without accepting a suggestion. A correction updates the draft;
// unrelated answers leave its identity intact, so visible confirmation stays valid.
export function mergePendingProposal(state: ProjectState, incoming: Proposal): Proposal | null {
  const previous = activeProposal(state);
  const next = proposalChanges(state, incoming);
  if (!hasProposalChanges(next)) return previous;
  if (!previous) return next;
  const fields = {...previous.fields, ...next.fields};
  const fieldRemovals = [...new Set([...(previous.fieldRemovals || []), ...(next.fieldRemovals || [])])].filter(key => !(key in next.fields));
  for (const key of fieldRemovals) delete fields[key];
  const seen = new Set<string>();
  const evidence = [...previous.evidence, ...next.evidence].filter(item => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const merged = proposalChanges({...state, pending: null}, {...next, fields, fieldRemovals,
    fieldStatuses: {...previous.fieldStatuses, ...next.fieldStatuses},
    fieldMeta: {...previous.fieldMeta, ...next.fieldMeta},
    projectTitle: next.projectTitle || previous.projectTitle,
    artifact: next.artifact || previous.artifact, hypothesis: next.hypothesis || previous.hypothesis, evidence,
    hypothesisAssessments: [...(previous.hypothesisAssessments || []).filter(a => !next.hypothesisAssessments?.some(b => a.hypothesisId === b.hypothesisId)), ...(next.hypothesisAssessments || [])],
    hypothesisUpdates: [...(previous.hypothesisUpdates || []).filter(a => !next.hypothesisUpdates?.some(b => a.hypothesisId === b.hypothesisId)), ...(next.hypothesisUpdates || [])]});
  return hasProposalChanges(merged) ? merged : null;
}
