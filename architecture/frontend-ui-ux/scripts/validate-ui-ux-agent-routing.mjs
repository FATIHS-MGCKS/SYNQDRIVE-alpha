/**
 * Deterministic checks: single UI/UX authority routing, no resurrected docs/ui canonical claims,
 * Figma-rule / AGENTS alignment with FEUX governance.
 */
import fs from 'fs';
import path from 'path';

const BANNER_MARKER = 'DOCUMENT STATUS';

export function validateUiUxAgentRouting(repoRoot, fail) {
  const requiredGov = [
    'architecture/frontend-ui-ux/governance/CANONICAL_AUTHORITY_MAP.md',
    'architecture/frontend-ui-ux/governance/FIGMA_AND_VISUAL_PRECEDENCE.md',
    'architecture/frontend-ui-ux/governance/FUTURE_DESIGN_CHANGE_POLICY.md',
    'architecture/frontend-ui-ux/governance/LEGACY_UI_UX_DOCUMENT_INVENTORY.md',
    'docs/ui/README.md',
    'architecture/frontend-ui-ux/design-system/SHARED_DESIGN_SYSTEM.md',
  ];
  for (const rel of requiredGov) {
    const fp = path.join(repoRoot, rel);
    if (!fs.existsSync(fp)) fail(`[agent-routing] missing required governance file: ${rel}`);
  }

  const docsUiReadme = fs.readFileSync(path.join(repoRoot, 'docs/ui/README.md'), 'utf8');
  if (!docsUiReadme.includes('HISTORICAL_SUPERSEDED')) {
    fail('[agent-routing] docs/ui/README.md must declare HISTORICAL_SUPERSEDED');
  }

  const agents = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  if (!agents.includes('architecture/frontend-ui-ux')) {
    fail('[agent-routing] AGENTS.md must reference architecture/frontend-ui-ux mandatory routing');
  }
  if (agents.match(/Figma is visual source of truth/i)) {
    fail('[agent-routing] AGENTS.md must not use unconditional "Figma is visual source of truth"');
  }

  const figmaRule = fs.readFileSync(path.join(repoRoot, '.cursor/rules/Figma-rule.mdc'), 'utf8');
  if (figmaRule.match(/Treat Figma as the source of truth for visual design/i)) {
    fail('[agent-routing] Figma-rule.mdc must not claim unconditional Figma visual SSOT');
  }
  if (!figmaRule.includes('FIGMA_AND_VISUAL_PRECEDENCE')) {
    fail('[agent-routing] Figma-rule.mdc must reference FIGMA_AND_VISUAL_PRECEDENCE');
  }

  const projekt = fs.readFileSync(path.join(repoRoot, '.cursor/rules/projektregel.mdc'), 'utf8');
  if (projekt.match(/Figma is the source of truth for visual design/i)) {
    fail('[agent-routing] projektregel.mdc must not claim unconditional Figma visual SSOT');
  }

  const contract = fs.readFileSync(
    path.join(repoRoot, 'architecture/frontend-ui-ux/AGENT_CONTRACT.md'),
    'utf8',
  );
  for (const needle of ['SHARED_DESIGN_SYSTEM.md', 'L0', 'parallel']) {
    if (!contract.includes(needle)) {
      fail(`[agent-routing] FEUX AGENT_CONTRACT.md missing required topic: ${needle}`);
    }
  }

  const docsUiDir = path.join(repoRoot, 'docs/ui');
  if (fs.existsSync(docsUiDir)) {
    for (const name of fs.readdirSync(docsUiDir)) {
      if (!name.endsWith('.md') || name === 'README.md') continue;
      if (!name.includes('canonical') && !name.includes('production-certification')) continue;
      const text = fs.readFileSync(path.join(docsUiDir, name), 'utf8');
      if (!text.includes(BANNER_MARKER)) {
        fail(`[agent-routing] docs/ui/${name} must include ${BANNER_MARKER} superseded banner`);
      }
    }
  }

  for (const rel of ['frontend/figma-master/README.md', 'frontend/figma-rental/README.md']) {
    const fp = path.join(repoRoot, rel);
    if (!fs.existsSync(fp)) fail(`[agent-routing] missing: ${rel}`);
    const text = fs.readFileSync(fp, 'utf8');
    if (!text.includes('DUPLICATE_OBSOLETE')) {
      fail(`[agent-routing] ${rel} must declare DUPLICATE_OBSOLETE`);
    }
  }
}