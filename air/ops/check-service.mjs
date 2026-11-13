/** Read-only operator check. Run through ssh localhost; output contains no names or secrets. */
import { readFile, statfs } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const problems = [];
try {
  const r = await fetch('http://127.0.0.1:3100/api/health', {signal:AbortSignal.timeout(8000)});
  if (!r.ok || !(await r.json()).ok) problems.push('application_unhealthy');
} catch { problems.push('application_unreachable'); }
try {
  const backup=JSON.parse(await readFile(join(homedir(),'.local/state/casaencomu/backup-status.json'),'utf8'));
  if (!backup.ok) problems.push('backup_failed');
  if (!Number.isFinite(Date.parse(backup.at)) || Date.now()-Date.parse(backup.at)>36*3600_000) problems.push('backup_stale');
} catch { problems.push('backup_status_missing'); }
for (const [path,label] of [[homedir(),'internal'],[process.env.CASA_DATA_DIR??'/Volumes/TimeMachine/casaencomu','data']]) {
  try { const s=await statfs(path); if(s.bavail*s.bsize<2*1024**3) problems.push(`${label}_disk_below_2gb`); }
  catch { problems.push(`${label}_disk_unavailable`); }
}
console.log(JSON.stringify({ok:!problems.length,at:new Date().toISOString(),problems}));
if(problems.length) process.exitCode=1;
