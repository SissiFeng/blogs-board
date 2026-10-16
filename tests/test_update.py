import unittest, sys, tempfile, json
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import update

BLOG={'id':'abc','name':'测试博客','url':'https://example.com/','feed':'https://example.com/feed','tags':['技术']}
class FeedTests(unittest.TestCase):
    def test_rss_fulltext_and_hostile_markup(self):
        xml=b'''<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>A &amp; B</title><link>https://example.com/post</link><pubDate>Tue, 13 Oct 2026 12:00:00 GMT</pubDate><description>Summary</description><content:encoded><![CDATA[<p>Hello</p><script>alert(1)</script><p>World &amp; friends</p>]]></content:encoded></item></channel></rss>'''
        a=update.parse_feed(xml,BLOG)[0]
        self.assertEqual(a['title'],'A & B'); self.assertIn('World & friends',a['content'])
        self.assertNotIn('alert',a['content']); self.assertIn('2026-10-13',a['date'])
    def test_atom_relative_url_and_undated(self):
        xml=b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom</title><link rel="self" href="feed/1"/><link href="/entry"/><content type="html">&lt;p&gt;Text&lt;/p&gt;</content></entry></feed>'''
        a=update.parse_feed(xml,BLOG)[0]
        self.assertEqual(a['url'],'https://example.com/entry'); self.assertEqual(a['date'],''); self.assertEqual(a['content'],'Text')
    def test_unsafe_url(self):
        self.assertEqual(update.safe_url('javascript:alert(1)'),'')
        self.assertEqual(update.safe_url('https://user:pass@example.com/'),'')
    def test_dtd_and_html_rejected(self):
        for xml in [b'<!DOCTYPE rss><rss/>', b'<html><body>Denied</body></html>']:
            with self.assertRaises(ValueError): update.parse_feed(xml,BLOG)
    def test_invalid_catalog_not_published(self):
        with self.assertRaises(ValueError): update.catalog('<html>Oops</html>')
    def test_failed_fetch_preserves_articles(self):
        with tempfile.TemporaryDirectory() as tmp:
            data=Path(tmp); (data/'articles').mkdir()
            a=dict(id='old',blogId='abc',title='old article',date='2026-10-12')
            previous=dict(blogs=[BLOG.copy()],articles=[a],lastSuccessAt='2026-10-12',catalogAt='2026-10-12')
            update.dump(data/'index.json',previous); update.dump(data/'articles/old.json',dict(a,content='正文'))
            with patch.object(update,'DATA',data),patch.object(update,'fetch',side_effect=OSError('offline')):
                update.main()
            output=json.loads((data/'index.json').read_text())
            self.assertEqual(output['articles'],[a]); self.assertEqual(output['lastSuccessAt'],'2026-10-12')
            self.assertEqual(output['successfulFeeds'],0); self.assertTrue((data/'articles/old.json').exists())
    def test_deterministic_ids_and_content_limit(self):
        xml=('<rss><channel><item><title>T</title><link>https://example.com/a</link><description>'+('x'*17000)+'</description></item></channel></rss>').encode()
        a=update.parse_feed(xml,BLOG)[0]; b=update.parse_feed(xml,BLOG)[0]
        self.assertEqual(a['id'],b['id']); self.assertEqual(len(a['content']),16000); self.assertTrue(a['truncated'])

if __name__=='__main__':unittest.main()
