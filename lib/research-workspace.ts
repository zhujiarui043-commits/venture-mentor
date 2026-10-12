import type { Artifact, ProjectState } from "./types";

import { artifactResearchModes, researchTextModes as textModes, type ResearchMode } from "./types";
export { researchModes, researchRecordPrefixes, artifactResearchModes, type ResearchMode } from "./types";
type Material = ProjectState["materials"][number];

function referencesMaterial(artifact: Artifact, material: Material): boolean {
  const refs = [artifact.interview?.sourceId, artifact.survey?.sourceId, artifact.funnel?.sourceId,
    ...(artifact.interview?.quotes.map(quote => quote.sourceId) || []),
    ...artifact.sources.map(source => source.label)];
  return refs.some(ref => ref?.match(/\bM\d+\b/gu)?.includes(material.id));
}

export function researchContent(artifacts: Artifact[], materials: Material[], mode: ResearchMode) {
  const research = artifacts.filter(artifact => artifact.section === "research");
  const modes = new Map(research.map(artifact => [artifact.id, artifactResearchModes(artifact)]));
  const materialModes = (material: Material): ResearchMode[] => {
    if (material.kind === "访谈记录") return ["用户访谈"];
    if (material.kind === "问卷数据") return ["问卷调查"];
    if (material.kind === "测试数据") return ["MVP 测试"];
    const linked = research.filter(artifact => referencesMaterial(artifact, material))
      .flatMap(artifact => modes.get(artifact.id) || []);
    if (linked.length) return [...new Set(linked)];
    const nameModes = textModes(material.name || "");
    return nameModes.length ? nameModes : textModes(material.content);
  };
  const classifiedMaterials = materials.map(material => ({material, modes: materialModes(material)}));
  return {
    artifacts: research.filter(artifact => modes.get(artifact.id)?.includes(mode)),
    materials: classifiedMaterials.filter(item => item.modes.includes(mode)).map(item => item.material),
    sharedArtifacts: research.filter(artifact => !modes.get(artifact.id)?.length),
    sharedMaterials: classifiedMaterials.filter(item => !item.modes.length).map(item => item.material),
  };
}
