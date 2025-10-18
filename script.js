// --- Arabic transliteration + helpers --------------------------------------
const AR_MAP = {'ا':'a','أ':'a','إ':'e','آ':'a','ب':'b','ت':'t','ث':'th','ج':'g','ح':'h','خ':'kh','د':'d','ذ':'z','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z','ع':'a','غ':'gh','ف':'f','ق':'k','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w','ي':'y','ى':'a','ء':'','ؤ':'o','ئ':'e','ة':'a','ﻻ':'la','لا':'la','ٓ':'','ْ':'','ّ':'','َ':'a','ُ':'u','ِ':'e','ً':'an','ٌ':'un','ٍ':'en'};
const AR_RE = /[\u0600-\u06FF]/;
const toLatin = s => s.split('').map(c => AR_MAP[c] ?? c).join('');
const normalize = s => s.toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9\s'-]/g,' ')
  .replace(/\s+/g,' ')
  .trim();
const escapeHtml = s => String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// --- State ------------------------------------------------------------------
let rows = [];
let fuse = null;
let fuseStrict = null; // stricter instance used for longer queries

// --- Boot -------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  const q = document.getElementById('q');
  const result = document.getElementById('result');
  const list = document.getElementById('list');
  const showAllBtn = document.getElementById('showAll');
  const clearBtn = document.getElementById('clear');

  try {
    await loadCsvFromUrl('./guests.csv?v=3');
  } catch (e) {
    console.error('Failed to load guests.csv', e);
  }

  q.addEventListener('input', () => handleSearch(q.value, result, list));
  q.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ q.value=''; handleSearch('', result, list);} });
  clearBtn.addEventListener('click', ()=>{ q.value=''; handleSearch('', result, list); q.focus(); });
  showAllBtn.addEventListener('click', ()=> renderFullList(list));

  if(rows.length){ renderFullList(list, {hide:true}); }
});

// --- CSV loader -------------------------------------------------------------
function loadCsvFromUrl(url){
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: ({data, errors}) => {
        if(errors?.length) console.warn(errors);
        if(!data?.length) return reject(new Error('CSV empty'));
        bootstrapData(data);
        resolve();
      },
      error: reject
    });
  });
}

function bootstrapData(data){
  rows = data
    .filter(r => r && (r.name || r.Name))
    .map(r => {
      const name = String(r.name || r.Name).trim();
      const table = String(r.table || r.Table || r.table_number || '').trim();
      return { 
        name, 
        table, 
        _norm: normalize(name), 
        _arAlt: normalize(toLatin(name)) 
      };
    });

  // --- Fuse setup with stricter threshold ---
  fuse = new Fuse(rows, {
    includeScore: true,
    shouldSort: true,
    minMatchCharLength: 2,  // allow short fragments
    threshold: 0.4,         // 0.4 = stricter matching (was 0.6)
    distance: 200,          // how far apart terms can be and still match
    ignoreLocation: true,   // ignore position in string
    keys: [
      { name: 'name',  weight: 0.6 },
      { name: '_norm', weight: 0.25 },
      { name: '_arAlt',weight: 0.15 }
    ]
  });

  // Create a stricter Fuse instance for longer queries (more "alike" results)
  fuseStrict = new Fuse(rows, {
    includeScore: true,
    shouldSort: true,
    minMatchCharLength: 3,
    threshold: 0.22,      // much stricter — only very close matches
    distance: 100,
    ignoreLocation: true,
    keys: [
      { name: 'name',  weight: 0.7 },
      { name: '_norm', weight: 0.2 },
      { name: '_arAlt',weight: 0.1 }
    ]
  });
}

// --- Search & list rendering -------------------------------------------------
function handleSearch(query, resultEl, listEl){
  const q = (AR_RE.test(query) ? toLatin(query) : query);
  const qn = normalize(q);
  if(!qn){
    resultEl.style.display='none';
    listEl.hidden = true;
    return;
  }

  // Choose a Fuse instance depending on the (normalized) query length.
  // For longer queries (>=4 chars) use the stricter matcher so results are very alike.
  const useStrict = qn.length >= 4 && fuseStrict;
  const searcher = useStrict ? fuseStrict : fuse;
  const hits = searcher ? searcher.search(qn) : [];
  if(!hits.length){
    resultEl.innerHTML = `<div>No close matches found. Try <button class="linklike" onclick="renderFullList(document.getElementById('list'));">viewing the full list</button>.</div>`;
    resultEl.style.display='block';
    listEl.hidden = true;
    return;
  }

  // Show all matches instead of just the first one
  const matchesHtml = hits.map(hit => `
    <div class="match-item">
      <span class="hitname">${escapeHtml(hit.item.name)}</span> — Table 
      <span class="tableno">${escapeHtml(hit.item.table || '—')}</span>
    </div>
  `).join('');
  
  resultEl.innerHTML = `
    <div>
      <div style="margin-bottom: 8px; font-weight: 600;">
        ${hits.length === 1 ? 'Match found:' : `${hits.length} matches found:`}
      </div>
      ${matchesHtml}
    </div>`;
  resultEl.style.display='block';
  listEl.hidden = true;
}

function renderFullList(listEl, opts={}){
  if(!rows.length){ listEl.hidden=true; return; }
  const sorted = [...rows].sort((a,b)=> a.name.localeCompare(b.name));
  listEl.innerHTML = `
    <table>
      <thead><tr><th style="width:70%">Guest</th><th>Table</th></tr></thead>
      <tbody>${sorted.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.table)}</td></tr>`).join('')}</tbody>
    </table>`;
  listEl.hidden = !!opts.hide;
}
