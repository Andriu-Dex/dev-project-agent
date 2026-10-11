import type { TrelloPlanning, TrelloItem } from '@dev-project-agent/contracts';

export function parsePlanning(description: string): TrelloPlanning {
  const field = (name: string) => description.split(/\r?\n/).map(line => line.trim().replace(/^[-*#]+\s*/, '')).filter(line => line.toLocaleUpperCase('es').startsWith(name + ':'));
  const value = (name: string) => { const matches = field(name); return matches.length === 1 ? matches[0]!.slice(matches[0]!.indexOf(':') + 1).trim() : null; };
  const wbs = value('CÓDIGO WBS');
  const declaration = value('PREDECESORAS WBS');
  const result: TrelloPlanning = { description, wbs: wbs && /^\d+(?:\.\d+)+$/.test(wbs) ? wbs : null, principal: value('RESPONSABLE PRINCIPAL'),
    dependencyDeclaration: declaration === null ? 'unavailable' : /^ninguna\.?$/i.test(declaration) ? 'none' : 'provided', dependencies: [], checklists: [] };
  if (result.dependencyDeclaration !== 'provided') return result;
  const pattern = /(\d+(?:\.\d+)+)\s*\(\s*(Fin\s*[-–—]\s*Inicio|Inicio\s*[-–—]\s*Inicio)\s*;\s*desfase\s+(-?\d+(?:\.\d+)?)\s*(horas?|d[ií]as?)?\s*\)/gi;
  const matches = [...declaration!.matchAll(pattern)];
  const remainder = declaration!.replace(pattern, '').replace(/[\s,;]+/g, '');
  if (!matches.length || remainder || matches.length > 100 || matches.some(match => Number(match[3]) !== 0 && !match[4])) {
    result.dependencyDeclaration = 'invalid'; return result;
  }
  result.dependencies = matches.map(match => ({ wbs: match[1]!, relation: /^Fin/i.test(match[2]!) ? 'finish_start' : 'start_start',
    lagHours: Number(match[3]) * (/^d/i.test(match[4] ?? '') ? 24 : 1), itemId: null }));
  if (result.dependencies.some(dep => !Number.isFinite(dep.lagHours) || Math.abs(dep.lagHours) > 8760)) {
    result.dependencyDeclaration = 'invalid'; result.dependencies = [];
  }
  return result;
}

export function resolveDependencies(items: TrelloItem[]) {
  const byWbs = new Map<string, TrelloItem[]>();
  for (const item of items.filter(item => !item.archived && item.kind !== 'reference')) {
    if (!item.planning?.wbs) { item.qualityIssues.push('missing_wbs'); continue; }
    const group = byWbs.get(item.planning.wbs) ?? []; group.push(item); byWbs.set(item.planning.wbs, group);
  }
  for (const group of byWbs.values()) if (group.length > 1) for (const item of group) item.qualityIssues.push('duplicate_wbs');
  for (const item of items) {
    if (!item.planning) continue;
    for (const dep of item.planning.dependencies) {
      const group = byWbs.get(dep.wbs);
      dep.itemId = group?.length === 1 ? group[0]!.id : null;
    }
  }
}
