// Always-loaded context added by ~/.claude: CLAUDE.md + rules (full text) + skill/agent descriptions (listing).
// Approximation: tokens ~= bytes / 4. Plugins are excluded (unchanged by router install).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const c = path.join(os.homedir(), '.claude');
const desc = f => { const m = fs.readFileSync(f, 'utf8').match(/^description:\s*(.*)$/m); return m ? m[1].length + 40 : 0; };
const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
const skills = fs.existsSync(path.join(c, 'skills')) ? fs.readdirSync(path.join(c, 'skills')).map(s => path.join(c, 'skills', s, 'SKILL.md')).filter(fs.existsSync) : [];
const agents = walk(path.join(c, 'agents')).filter(f => f.endsWith('.md'));
const rules = walk(path.join(c, 'rules')).filter(f => f.endsWith('.md'));
const r = {
  claude_md: fs.existsSync(path.join(c, 'CLAUDE.md')) ? fs.statSync(path.join(c, 'CLAUDE.md')).size : 0,
  rules: rules.reduce((s, f) => s + fs.statSync(f).size, 0),
  skill_listing: skills.reduce((s, f) => s + desc(f), 0),
  agent_listing: agents.reduce((s, f) => s + desc(f), 0),
};
r.total_bytes = Object.values(r).reduce((a, b) => a + b, 0);
r.approx_tokens = Math.round(r.total_bytes / 4);
r.counts = { skills: skills.length, agents: agents.length, rules: rules.length };
console.log(JSON.stringify(r));
