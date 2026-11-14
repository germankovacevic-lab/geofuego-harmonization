#!/usr/bin/env node
// audit_flare_start_year.mjs — Does the time-invariant flare mask (static class rules 1–2) remove vegetation fire from the
// reconstructed years, before the wells existed? For every flare cell: first year with persistent nocturnal activity
// (>= 4 distinct months with detections and >= 50 % night in that year, any sensor; fallback: >= 4 months). Then the MODIS
// type-0 detections of 2003–2011 inside flare cells are split into BEFORE the cell's start year (possible vegetation fire
// removed by the mask) and AFTER (the source was already active), per province, with night share and peak months.
// Written with SI assistance (Claude, Anthropic); reviewed and validated by the team.
// Output: data/validation/flare_start_year.json
import { createReadStream } from 'node:fs'; import { readFile, writeFile } from 'node:fs/promises'; import readline from 'node:readline'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { provinceOf } from '../lib/geo.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), RAW = path.join(ROOT, 'data', 'raw'), CEL = 0.02; const key = (la, lo) => Math.floor(la / CEL) + ':' + Math.floor(lo / CEL);
const S=JSON.parse(await readFile(ROOT+'/data/agg/static_cells.json','utf8')); const flare=new Map(Object.entries(S.cells).filter(([k,c])=>c.rule!=='modis-type2-static'));
const man=JSON.parse(await readFile(path.join(RAW, 'MANIFEST.json'),'utf8'));
const act=new Map(); // key -> year -> {months:Set, n, night}
const det=[]; // MODIS type0 2003-2011 in flare cells: [key, year, month, isNight]
for (const [file,meta] of Object.entries(man)) { if(!['modis','viirs-snpp'].includes(meta.sensor)) continue; const isM=meta.sensor==='modis';
  const rl=readline.createInterface({input:createReadStream(path.join(RAW,file))}); let h=true;
  for await (const l of rl){ if(h){h=false;continue;} const f=l.split(','); if(f.length<15) continue; if(isM? +f[9]<30 : f[9]==='l') continue; const k=key(+f[0],+f[1]); if(!flare.has(k)) continue; if(f[14]!=='0' && f[14]!=='2') continue;
    const y=+f[5].slice(0,4), m=+f[5].slice(5,7), night=f[13]==='N';
    let a=act.get(k); if(!a) act.set(k,a={}); const o=(a[y]??={months:new Set(),n:0,night:0}); o.months.add(m); o.n++; if(night)o.night++;
    if(isM && f[14]==='0' && y>=2003 && y<=2011) det.push([k,y,m,night]); } }
// start year: first year with >=4 distinct months AND night share >=0.5 (persistent nocturnal source), looking at all years; fallback: first year with >=4 months
const start=new Map();
for (const [k,a] of act){ const ys=Object.keys(a).map(Number).sort((x,y)=>x-y); let s=null; for(const y of ys){ const o=a[y]; if(o.months.size>=4 && o.night/o.n>=0.5){ s=y; break; } } if(s===null) for(const y of ys){ if(a[y].months.size>=4){ s=y; break; } } start.set(k, s ?? 9999); }
const hist={}; for (const [k,s] of start){ const p=(provinceOf(flare.get(k).lat,flare.get(k).lon)||'?').split(',')[0]; const b=s<=2003?'<=2003':s<=2008?'2004-08':s<=2011?'2009-11':s<=2015?'2012-15':s<9999?'2016+':'never'; ((hist[p]??={})[b]=(hist[p][b]||0)+1); }
console.log('flare cells by province and start year of persistent nocturnal activity:'); for (const p of ['Neuquén','Santa Cruz','Salta','Chaco','Buenos Aires','Mendoza','Tierra del Fuego','Río Negro','Chubut']) console.log(' ',p.padEnd(16), JSON.stringify(hist[p]||{}));
// MODIS 2003-2011 detections in flare cells: before vs after start year, by province, with day share and seasonality
const agg={}; for (const [k,y,m,night] of det){ const p=(provinceOf(flare.get(k).lat,flare.get(k).lon)||'?').split(',')[0]; const pre=y<start.get(k); const o=((agg[p]??={})[pre?'pre':'post']??={n:0,night:0,months:Array(13).fill(0)}); o.n++; if(night)o.night++; o.months[m]++; }
console.log('\nMODIS type-0 2003-2011 inside flare cells: before the cell\'s start year (vegetation fire removed?) vs after');
console.log('province          pre n  night%  top months      | post n  night%  top months');
const top=o=>o.months.map((v,i)=>[v,i]).slice(1).sort((a,b)=>b[0]-a[0]).slice(0,3).map(x=>x[1]).join(',');
let totPre=0,totPost=0; for (const [p,o] of Object.entries(agg).sort((a,b)=>((b[1].pre?.n||0)+(b[1].post?.n||0))-((a[1].pre?.n||0)+(a[1].post?.n||0))).slice(0,10)){ const a=o.pre||{n:0,night:0,months:Array(13).fill(0)}, b=o.post||{n:0,night:0,months:Array(13).fill(0)}; totPre+=a.n; totPost+=b.n; console.log(`${p.padEnd(17)} ${String(a.n).padStart(5)}  ${a.n?(100*a.night/a.n).toFixed(0):'-'}%    ${top(a).padEnd(12)} | ${String(b.n).padStart(6)}  ${b.n?(100*b.night/b.n).toFixed(0):'-'}%    ${top(b)}`); }
console.log('total pre-start',totPre,'post-start',totPost);

const provTot = {}; // MODIS type-0 2003-2011 per province (all cells) for shares
for (const [file, meta] of Object.entries(man)) { if (meta.sensor !== 'modis') continue; const yr = +file.match(/_(\d{4})_/)[1]; if (yr < 2003 || yr > 2011) continue; const rl = readline.createInterface({ input: createReadStream(path.join(RAW, file)) }); let h = true; for await (const l of rl) { if (h) { h = false; continue; } const f = l.split(','); if (f.length < 15 || f[14] !== '0' || +f[9] < 30) continue; const p = (provinceOf(+f[0], +f[1]) || '?').split(',')[0]; provTot[p] = (provTot[p] || 0) + 1; } }
const out = { generated: new Date().toISOString(), rule: 'start year = first year with >= 4 distinct months and >= 50 % night detections in the cell (any sensor); fallback >= 4 months; never = no such year', cells_by_province_and_start: hist, modis_2003_2011_inside_flare_cells: Object.fromEntries(Object.entries(agg).map(([p, o]) => [p, { before_start: o.pre ? { n: o.pre.n, night_share: +(o.pre.night / o.pre.n).toFixed(2), top_months: top(o.pre), share_of_province_modis: +(o.pre.n / provTot[p]).toFixed(4) } : null, after_start: o.post ? { n: o.post.n, night_share: +(o.post.night / o.post.n).toFixed(2), top_months: top(o.post) } : null }])), total_before_start: totPre, total_after_start: totPost, national_modis_2003_2011: Object.values(provTot).reduce((a, b) => a + b, 0) };
await writeFile(path.join(ROOT, 'data', 'validation', 'flare_start_year.json'), JSON.stringify(out, null, 1));
console.log(`\nshare of province MODIS 2003-2011 that is vegetation fire BEFORE the flare started: ${Object.entries(out.modis_2003_2011_inside_flare_cells).filter(([, v]) => v.before_start).sort((a, b) => b[1].before_start.share_of_province_modis - a[1].before_start.share_of_province_modis).slice(0, 6).map(([p, v]) => `${p} ${(100 * v.before_start.share_of_province_modis).toFixed(1)}%`).join(' · ')} · national ${(100 * totPre / out.national_modis_2003_2011).toFixed(2)}%`);
