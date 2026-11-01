// Abgeschirmte Vorschau für von KI erstellte Webseiten.
// Läuft in einem iframe ohne Zugriff auf VAIs (kein Cookie, kein Login, eigener Ursprung).
window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.data?.type !== 'vais-render') return;
  const shim = "<script>/* VAIs: Speicher-Ersatz für abgeschottete Seiten */(function(){function mk(){var m=new Map();return{getItem:function(k){return m.has(String(k))?m.get(String(k)):null},setItem:function(k,v){m.set(String(k),String(v))},removeItem:function(k){m.delete(String(k))},clear:function(){m.clear()},key:function(i){return Array.from(m.keys())[i]||null},get length(){return m.size}}}['localStorage','sessionStorage'].forEach(function(n){try{window[n].getItem('x')}catch(e){try{Object.defineProperty(window,n,{value:mk(),configurable:true})}catch(e2){}}});try{document.cookie}catch(e){try{Object.defineProperty(document,'cookie',{get:function(){return''},set:function(){},configurable:true})}catch(e2){}}})();</script>";
  const html = String(event.data.html ?? '');
  document.open();
  document.write(/<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + shim) : shim + html);
  document.close();
});
window.parent.postMessage({ type: 'vais-sandbox-ready' }, '*');
