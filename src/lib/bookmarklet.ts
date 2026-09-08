/** Form fields the bookmarklet POSTs to `api/capture`, in this order. The route reads exactly these. */
export const BOOKMARKLET_FIELDS = ["token", "url", "title", "ld", "og", "blob", "imgs", "text"] as const;

/**
 * The collector, hand-minified, ES5, no dependencies — it runs inside the portal's page. One
 * expression returning a JSON string, so the same code serves both readers: the bookmarklet
 * parses it and posts a form, and the browser reader on the host evaluates it and gets the string
 * straight back.
 *
 * Collects: location.href · document.title · every ld+json script (JSON array) · og:* metas (JSON
 * map) · the portal blob (Fotocasa `script#__initial_props__`, else the inline script holding
 * Habitaclia's `FichaDesktopDTO`, else the one holding Idealista's `adMultimediasInfo`; ≤ 400 KB) ·
 * ≤ 60 absolute, deduped `img` URLs (JSON array) · the first 20 KB of body.innerText.
 */
export const COLLECT =
  "(function(){var d=document,J=JSON.stringify,q=function(s){return Array.from(d.querySelectorAll(s))},t=function(e){return e.textContent||''};" +
  "var o={};q('meta[property^=\"og:\"]').forEach(function(m){o[m.getAttribute('property')]=m.getAttribute('content')||''});" +
  "var b=d.getElementById('__initial_props__'),s=q('script:not([src])'),i;" +
  "if(b)b=t(b);else{b='';for(i=0;i<s.length&&!b;i++)if(t(s[i]).indexOf('FichaDesktopDTO')>-1)b=t(s[i]);" +
  "for(i=0;i<s.length&&!b;i++)if(t(s[i]).indexOf('adMultimediasInfo')>-1)b=t(s[i])}" +
  "var g=[];q('img').forEach(function(x){var u=x.currentSrc||x.src;if(u&&u.indexOf('http')==0&&g.indexOf(u)<0&&g.length<60)g.push(u)});" +
  "return J({url:location.href,title:d.title,ld:J(q('script[type=\"application/ld+json\"]').map(t)),og:J(o),blob:b.slice(0,4e5),imgs:J(g),text:(d.body.innerText||'').slice(0,2e4)})})()";

// Keep it a form POST: a page-script fetch() to the app hangs on Chrome's local-network check (spike).
const SUBMIT =
  "(function(){var d=document,v=JSON.parse(__COLLECT__);v.token=__TOKEN__;" +
  "var f=d.createElement('form'),k,n;f.method='POST';f.action=__ACTION__;f.target='_blank';" +
  "for(k in v){n=d.createElement('input');n.type='hidden';n.name=k;n.value=v[k];f.appendChild(n)}" +
  "d.body.appendChild(f);f.submit()})()";

/** The `javascript:` URL of the bookmark for one member; `token` is that member's `capture_token`. */
export function buildBookmarklet(publicUrl: string, token: string): string {
  // JSON.stringify makes both values JS string literals; encodeURIComponent then makes the whole
  // thing URL-safe, so the href holds no quote, angle bracket or ampersand.
  const action = JSON.stringify(publicUrl.replace(/\/+$/, "") + "/api/capture");
  const code = SUBMIT.replace("__COLLECT__", () => COLLECT)
    .replace("__ACTION__", () => action)
    .replace("__TOKEN__", () => JSON.stringify(token));
  return "javascript:" + encodeURIComponent(code);
}
