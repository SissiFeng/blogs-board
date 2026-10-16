'use strict';
const $ = s => document.querySelector(s);
const KEY = 'blog-harbor-v1';
let state;
try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { state = {}; }
state.read = Array.isArray(state.read) ? state.read : [];
state.saved = state.saved && typeof state.saved === 'object' ? state.saved : {};
let data = { blogs: [], articles: [] }, view = 'all', tag = '', query = '', limit = 24, shown = [], current = null, sequence = 0;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url = s => { try { const u = new URL(s); return ['http:', 'https:'].includes(u.protocol) ? u.href : '#'; } catch { return '#'; } };
const date = s => s && !isNaN(Date.parse(s)) ? new Date(s).toLocaleDateString('zh-CN', {month:'short',day:'numeric',year:'numeric'}) : '日期未知';
function toast(text) { $('#toast').textContent = text; $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').hidden = true, 2800); }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast('浏览器存储不足，请导出记录备份。'); } }
function counts() {
  $('#all-count').textContent = data.articles.length;
  $('#unread-count').textContent = data.articles.filter(a => !state.read.includes(a.id)).length;
  $('#saved-count').textContent = Object.keys(state.saved).length;
  $('#blog-count').textContent = data.blogs.length.toLocaleString();
  $('#article-count').textContent = data.articles.length.toLocaleString();
}
function topics() {
  const tally = {};
  data.blogs.forEach(b => b.tags.forEach(t => tally[t] = (tally[t] || 0) + 1));
  const tags = Object.keys(tally).sort((a,b) => tally[b]-tally[a]).slice(0,7);
  const button = (t, name) => `<button data-tag="${esc(t)}" class="${t===tag?'active':''}">${esc(name)}</button>`;
  $('#chips').innerHTML = button('', '全部') + tags.slice(0,5).map(t => button(t,t)).join('');
  $('#side-tags').innerHTML = tags.map(t => button(t,t)).join('');
}
function render() {
  counts(); topics();
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const titles = {all:['今天，读点不一样的。','离开信息流的喧嚣，在独立博客里发现新的视角。'],unread:['留一些时间，给新鲜的想法。','尚未读过的文字，等待一次不经意的相遇。'],saved:['把喜欢的文字，留在这里。','收藏与已读记录保存在当前浏览器，可导出备份。'],blogs:['每一个博客，都是一扇窗。','浏览全部来源、订阅状态与主题，找到你想听见的声音。']};
  $('#page-title').textContent = titles[view][0]; $('#page-desc').textContent = titles[view][1];
  let rows = view==='blogs' ? data.blogs : view==='saved' ? Object.values(state.saved) : data.articles;
  rows = rows.filter(a => (!tag || a.tags.includes(tag)) && (!query || [a.title,a.blog,a.name,a.summary,...a.tags].join(' ').toLowerCase().includes(query)) && (view!=='unread'||!state.read.includes(a.id)));
  if(view!=='blogs') rows = rows.slice().sort((a,b) => (($('#sort').value==='old'?1:-1)) * (a.date||'').localeCompare(b.date||''));
  shown = rows.slice(0,limit);
  $('#result-count').textContent = `${view==='blogs'?'博客目录':'阅读列表'} / ${rows.length.toLocaleString()} ${view==='blogs'?'个博客':'篇文章'}`;
  $('#sort').hidden = view==='blogs'; $('#mark-all').hidden = view==='blogs';
  $('#cards').innerHTML = shown.map(a => view==='blogs' ? blogCard(a) : articleCard(a)).join('') || `<div class="empty"><h2>${query||tag?'没有找到匹配的内容':view==='saved'?'把值得重读的文章收藏起来':view==='unread'?'你已经读完在架的文章了':'阅读室已准备好，等待第一次更新'}</h2><p>${data.articles.length?'试试其他主题，或调整搜索关键词。':'博客目录已载入。运行 GitHub Actions 的 Update reading library 后，这里会出现真实文章。'}</p><button data-directory>浏览博客目录 ↗</button></div>`;
  $('#more').hidden = rows.length <= limit;
}
function articleCard(a) {
  const read = state.read.includes(a.id), saved = !!state.saved[a.id];
  return `<article class="card ${read?'read':''}"><div class="card-top"><span class="avatar">${esc(a.blog.slice(0,1))}</span><span class="blog-name">${esc(a.blog)}</span>${read?'':'<i class="dot" title="未读"></i>'}</div><h2><button class="article-open" data-open="${esc(a.id)}">${esc(a.title)}</button></h2><p class="excerpt">${esc(a.summary)}</p><div class="card-bottom">${a.tags.slice(0,2).map(t=>`<button class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}<time>${esc(date(a.date))}</time><button class="save ${saved?'saved':''}" data-save="${esc(a.id)}" aria-label="${saved?'取消收藏':'收藏文章'}" aria-pressed="${saved}">${saved?'★':'☆'}</button></div></article>`;
}
function blogCard(b) {
  const status = b.status==='ok'?'订阅正常':b.status==='error'?'暂时无法更新':!b.feed?'未提供 RSS':'等待首次检查';
  return `<article class="card blog-card"><div class="card-top"><span class="avatar">${esc(b.name.slice(0,1))}</span><span class="${b.status==='error'?'status-error':''}">${status}</span></div><h2><a href="${esc(url(b.url))}" target="_blank" rel="noreferrer">${esc(b.name)} ↗</a></h2><p class="excerpt">${esc(b.tags.join(' · ')||'独立博客')}<br>${b.lastSuccess?'最近成功更新 '+esc(date(b.lastSuccess)):'等待订阅更新'}</p><div class="card-bottom"><button data-blog="${esc(b.id)}">查看文章 →</button>${b.feed?`<a href="${esc(url(b.feed))}" target="_blank" rel="noreferrer">RSS ↗</a>`:''}</div></article>`;
}
async function load() {
  $('#reload').disabled = true;
  try {
    const response = await fetch('data/index.json', {cache:'no-cache'});
    if (!response.ok) throw Error('HTTP '+response.status);
    data = await response.json();
    $('#sync').textContent = data.lastSuccessAt ? `最近更新 ${date(data.lastSuccessAt)} ${new Date(data.lastSuccessAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}` : '等待首次订阅更新';
    const stale = data.lastSuccessAt && Date.now()-Date.parse(data.lastSuccessAt)>36*3600*1000;
    $('#notice').hidden = !stale && !(data.updatedAt && !data.successfulFeeds);
    $('#notice').textContent = stale ? '订阅数据已超过 36 小时未成功更新，请检查 GitHub Actions。旧文章仍可阅读。' : '这次抓取未成功，已保留之前的文章。请检查更新任务。';
    render();
  } catch { $('#notice').hidden = false; $('#notice').textContent = '暂时无法载入订阅数据，请稍后重新载入。'; $('#sync').textContent = '载入失败'; render(); }
  finally { $('#reload').disabled = false; }
}
function find(id) { return data.articles.find(a=>a.id===id) || state.saved[id]; }
function save(id) {
  if(state.saved[id]) { delete state.saved[id]; toast('已取消收藏'); }
  else { const a=find(id); if(!a)return; state.saved[id]={...a}; if(current?.id===id) state.saved[id]={...current}; toast('已加入收藏'); }
  persist(); render(); updateSave();
}
function updateSave() { $('#reader-save').textContent = current && state.saved[current.id] ? '★ 已收藏' : '☆ 收藏'; }
async function open(id) {
  const a = find(id); if(!a)return;
  const ticket = ++sequence; current = a;
  $('#reader-body').innerHTML = '<p class="reader-note">正在载入文章…</p>';
  if(!$('#reader').open) $('#reader').showModal(); updateSave();
  try {
    let full = state.saved[id]?.content ? state.saved[id] : null;
    if(!full) { const r=await fetch(`data/articles/${encodeURIComponent(id)}.json`); if(!r.ok)throw Error(); full=await r.json(); }
    if(ticket!==sequence || !$('#reader').open)return;
    current = full;
    if(state.saved[id])state.saved[id]={...full};
  } catch { if(ticket!==sequence || !$('#reader').open)return; current = {...a,content:a.summary+'\n\n正文暂时无法载入，或文章已从在架列表中归档。可点击下方链接前往原文。'}; }
  if(!state.read.includes(id)) state.read.push(id);
  persist(); render();
  $('#reader-body').innerHTML = `<p class="meta">${esc(current.blog)} · ${esc(date(current.date))}</p><h1>${esc(current.title)}</h1><p class="reader-note">以下为 RSS 提供的内容，可能仅包含摘要。${current.truncated?'长文已截取，请前往原文阅读全文。':''}</p><div class="content">${esc(current.content)}</div><a href="${esc(url(current.url))}" target="_blank" rel="noreferrer">前往原文，继续阅读 ↗</a>`;
  $('#reader').scrollTop=0; updateSave();
}
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b)return;
  if(b.dataset.view) { view=b.dataset.view;tag='';limit=24;render(); }
  if('tag' in b.dataset) {tag=b.dataset.tag;limit=24;render();}
  if(b.dataset.open)open(b.dataset.open);
  if(b.dataset.save)save(b.dataset.save);
  if('directory' in b.dataset){view='blogs';tag='';query='';$('#search').value='';render();}
  if(b.dataset.blog){const blog=data.blogs.find(x=>x.id===b.dataset.blog);view='all';tag='';query=blog.name.toLowerCase();$('#search').value=blog.name;limit=24;render();}
});
$('#search').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();limit=24;render();});
$('#sort').addEventListener('change',render);
$('#more').onclick=()=>{limit+=24;render();};
$('#reload').onclick=load;
$('#mark-all').onclick=()=>{state.read=[...new Set([...state.read,...shown.map(a=>a.id)])];persist();render();toast('本页文章已标为已读');};
$('#close-reader').onclick=()=>{$('#reader').close();sequence++;};
$('#reader').addEventListener('close',()=>{sequence++;});
$('#reader-save').onclick=()=>{if(current)save(current.id);};
$('#theme').onclick=()=>{state.dark=!state.dark;document.body.classList.toggle('dark',state.dark);persist();};
document.body.classList.toggle('dark',!!state.dark);
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('#reader').open){e.preventDefault();$('#search').focus();}});
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='blog-harbor-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);};
$('#import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>20e6)throw Error();const s=JSON.parse(await file.text());if(!Array.isArray(s.read)||!s.saved||Array.isArray(s.saved)||typeof s.saved!=='object')throw Error();for(const [id,a] of Object.entries(s.saved)){if(!/^[a-f0-9]{24}$/.test(id)||a.id!==id||!Array.isArray(a.tags)||typeof a.title!=='string'||typeof a.blog!=='string')throw Error();}state.read=[...new Set([...state.read,...s.read.filter(x=>typeof x==='string')])];state.saved={...state.saved,...s.saved};persist();render();toast('阅读记录已合并');}catch{toast('无法导入，请选择博间导出的 JSON 备份。');}e.target.value='';};
load();
