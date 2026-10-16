"""Fetch the upstream catalog and RSS/Atom; publish bounded, plain-text static data."""
import concurrent.futures, csv, hashlib, io, json, re, sys
import urllib.request, urllib.parse, urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'
CATALOG = 'https://raw.githubusercontent.com/timqian/chinese-independent-blogs/master/blogs-original.csv'
MAX_ITEMS = 3000

class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if not self.hidden and tag in ('p','div','br','li','h1','h2','h3','pre','blockquote'): self.parts.append('\n\n')
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.hidden = max(0, self.hidden - 1)
        if not self.hidden and tag in ('p','div','li','pre'): self.parts.append('\n\n')
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)

def plain(value):
    p = Text(); p.feed(value or '')
    return re.sub(r'\n[ \t\n]+', '\n\n', ''.join(p.parts)).strip()

def safe_url(value, base=''):
    value = urllib.parse.urljoin(base, (value or '').strip())
    u = urllib.parse.urlsplit(value)
    return value if u.scheme in ('http','https') and u.hostname and not u.username else ''

def stamp(value):
    try:
        try: d = datetime.fromisoformat(value.replace('Z','+00:00'))
        except ValueError: d = parsedate_to_datetime(value)
        return d.replace(tzinfo=d.tzinfo or timezone.utc).astimezone(timezone.utc).isoformat()
    except (ValueError, TypeError, AttributeError, OverflowError): return ''

def ident(value): return hashlib.sha256(value.encode()).hexdigest()[:24]

def catalog(text):
    reader = csv.DictReader(io.StringIO(text), skipinitialspace=True)
    result = {}; 
    for raw in reader:
        row = {k.strip(): (v or '').strip() for k,v in raw.items() if k}
        url = safe_url(row.get('Address')); feed = safe_url(row.get('RSS feed'))
        if not url: continue
        key = ident(url.rstrip('/'))
        result[key] = dict(id=key, name=row.get('Introduction') or url, url=url, feed=feed,
                           tags=[x.strip() for x in row.get('tags','').split(';') if x.strip()][:12])
    if len(result) < 10: raise ValueError('上游目录格式异常，保留原数据')
    return list(result.values())

def parse_feed(body, blog):
    # ElementTree never resolves external entities; reject DTDs explicitly.
    if b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper(): raise ValueError('不支持 DTD')
    root = ET.fromstring(body)
    local = lambda tag: tag.rsplit('}',1)[-1]
    if local(root.tag) not in ('rss','feed','RDF'): raise ValueError('不是 RSS/Atom')
    items = [e for e in root.iter() if local(e.tag) in ('item','entry')][:15]
    articles = []
    for e in items:
        children = {}
        for c in e: children.setdefault(local(c.tag), []).append(c)
        def value(*keys):
            for k in keys:
                if k in children:
                    node = children[k][0]
                    # Preserve XHTML paragraph boundaries before converting to text.
                    return (node.text or '') + ''.join(ET.tostring(x, encoding='unicode') for x in node)
            return ''
        link = value('link')
        for l in children.get('link',[]):
            if l.get('href') and l.get('rel','alternate') == 'alternate': link = l.get('href'); break
        if not link.strip(): continue
        link = safe_url(link, blog['url'])
        if not link: continue
        title = plain(value('title'))[:350] or '无标题'
        raw = value('encoded','content','description','summary')
        content = plain(raw)
        if not content: content = '订阅源未提供正文，请前往原文阅读。'
        articles.append(dict(id=ident(blog['id']+'|'+link), blogId=blog['id'], blog=blog['name'],
            url=link, title=title, date=stamp(value('pubDate','published','date','updated')),
            tags=blog['tags'], summary=re.sub(r'\s+',' ',content)[:220],
            content=content[:16000], truncated=len(content)>16000))
    return articles

def fetch(url, headers=None, redirects=3):
    # Limit redirects so one broken feed cannot consume an entire run.
    class Redirect(urllib.request.HTTPRedirectHandler):
        max_redirections = redirects
        max_repeats = redirects
    req = urllib.request.Request(url, headers={'User-Agent':'BlogHarbor/1.0 (personal RSS reader)', **(headers or {})})
    with urllib.request.build_opener(Redirect()).open(req, timeout=10) as r:
        body = r.read(2_000_001)
        if len(body)>2_000_000: raise ValueError('订阅源超过 2MB')
        return body, dict(r.headers)

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',',':')), encoding='utf-8')

def main():
    DATA.mkdir(parents=True, exist_ok=True)
    old = json.loads((DATA/'index.json').read_text()) if (DATA/'index.json').exists() else {'articles':[], 'blogs':[]}
    previous = {b['id']:b for b in old['blogs']}
    now = datetime.now(timezone.utc).isoformat()
    try:
        raw, _ = fetch(CATALOG)
        blogs = catalog(raw.decode('utf-8-sig'))
        catalog_at = now
    except Exception as error:
        if not old['blogs']: raise
        print('目录更新失败，使用已有目录:', type(error).__name__)
        blogs = old['blogs']; catalog_at = old.get('catalogAt')
    articles = {a['id']:a for a in old['articles'] if a['blogId'] in {b['id'] for b in blogs}}
    success = 0
    def work(b):
        prev = previous.get(b['id'], {})
        b.update({k: prev[k] for k in ('lastSuccess','etag','modified') if k in prev})
        if not b['feed']: b['status']='no-feed'; return b, []
        headers = {}
        if b.get('etag'): headers['If-None-Match']=b['etag']
        if b.get('modified'): headers['If-Modified-Since']=b['modified']
        try:
            body, h = fetch(b['feed'],headers)
            parsed = parse_feed(body,b)
            b.update(status='ok', lastSuccess=now, etag=h.get('ETag',''), modified=h.get('Last-Modified',''))
            return b, parsed
        except urllib.error.HTTPError as e:
            if e.code == 304: b.update(status='ok',lastSuccess=now); return b, []
            b.update(status='error',error=f'HTTP {e.code}')
        except Exception as e: b.update(status='error', error=type(e).__name__)
        return b, []
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        for b, batch in pool.map(work, blogs):
            if b['status']=='ok': success += 1; b.pop('error',None)
            for a in batch:
                dump(DATA/'articles'/f"{a['id']}.json",a)
                articles[a['id']]={k:v for k,v in a.items() if k not in ('content','truncated')}
    # Never pretend a failed refresh is a successful update.
    kept = sorted(articles.values(),key=lambda a:a.get('date') or '',reverse=True)[:MAX_ITEMS]
    valid = {a['id'] for a in kept}
    (DATA/'articles').mkdir(parents=True, exist_ok=True)
    for p in (DATA/'articles').glob('*.json'):
        if p.stem not in valid: p.unlink()
    dump(DATA/'index.json',dict(updatedAt=now, catalogAt=catalog_at,
        lastSuccessAt=now if success else old.get('lastSuccessAt'), successfulFeeds=success,
        source=CATALOG, blogs=blogs, articles=kept))
    print(f'{len(blogs)} blogs / {success} healthy feeds / {len(kept)} articles')
    if not success: print('没有成功获取的订阅源；旧文章已保留',file=sys.stderr)

if __name__ == '__main__': main()
