import type { Artifact, CompetitionData, CompetitionSelection, CompetitionWorkspaceRow, Competitor, ProjectState } from "./types";

export type CompetitionRow = CompetitionWorkspaceRow & { competitor: Competitor; recordId?: string };
type CompetitionState = Pick<ProjectState, "artifacts" | "competitionWorkspace">;

function productKey(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function selectionKey(selection: CompetitionSelection) {
  return `${selection.artifactId}:${selection.competitorIndex}`;
}

// References keep retained content tied to its original immutable source record.
export function currentCompetition(state: CompetitionState): {artifact: Artifact & {competition: CompetitionData}; rows: CompetitionRow[]} | undefined {
  const latest = state.artifacts.findLast(artifact => artifact.section === "competitors" && artifact.competition);
  if (!latest?.competition) return;
  const entries = state.competitionWorkspace?.artifactId === latest.id
    ? state.competitionWorkspace.rows
    : latest.competition.competitors.map((_, competitorIndex) => ({artifactId: latest.id, competitorIndex, retained: false}));
  const artifacts = new Map(state.artifacts.map(artifact => [artifact.id, artifact]));
  const rows = entries.flatMap(entry => {
    const original = artifacts.get(entry.artifactId);
    const competitor = original?.competition?.competitors[entry.competitorIndex];
    return competitor ? [{...entry, competitor, recordId: original?.recordId}] : [];
  });
  const sourceArtifacts = new Set([latest.id, ...rows.map(row => row.artifactId)]);
  const seenSources = new Set<string>();
  const sources = [...sourceArtifacts].flatMap(id => (artifacts.get(id)?.sources || []).filter(source => {
    const key = JSON.stringify(source);
    if (seenSources.has(key)) return false;
    seenSources.add(key);
    return true;
  }));
  return {artifact: {...latest, sources, competition: {...latest.competition, competitors: rows.map(row => row.competitor)}}, rows};
}

// Called before appending the new record. Unchecked rows remain until a new search.
export function syncCompetitionWorkspace(state: CompetitionState, artifact: Artifact, freshSearch: boolean) {
  if (artifact.section !== "competitors" || !artifact.competition) return;
  const retained = currentCompetition(state)?.rows.filter(row => row.retained) || [];
  const retainedNames = new Set(retained.map(row => productKey(row.competitor.name)));
  const rows: CompetitionWorkspaceRow[] = freshSearch
    ? retained.map(({artifactId, competitorIndex}) => ({artifactId, competitorIndex, retained: true}))
    : [];
  const seen = new Set(freshSearch ? retainedNames : []);
  artifact.competition.competitors.forEach((competitor, competitorIndex) => {
    const key = productKey(competitor.name);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({artifactId: artifact.id, competitorIndex, retained: !freshSearch && retainedNames.has(key)});
  });
  state.competitionWorkspace = {artifactId: artifact.id, rows};
}

export function setCompetitionRetention(state: CompetitionState, selection: CompetitionSelection, retained: boolean): boolean {
  const current = currentCompetition(state);
  const row = current?.rows.find(candidate => selectionKey(candidate) === selectionKey(selection));
  if (!current || !row) return false;
  state.competitionWorkspace = {artifactId: current.artifact.id, rows: current.rows.map(candidate => ({
    artifactId: candidate.artifactId, competitorIndex: candidate.competitorIndex,
    retained: selectionKey(candidate) === selectionKey(selection) ? retained : candidate.retained,
  }))};
  return true;
}
