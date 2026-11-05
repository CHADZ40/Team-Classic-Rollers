(() => {
  const link = document.querySelector('a[href="/request"]'); if (!link) return;
  let badge=link.querySelector('.pending-badge'); if(!badge){badge=document.createElement('span');badge.className='pending-badge';link.appendChild(badge)}
  const style=document.createElement('style');style.textContent='a[href="/request"]{position:relative;overflow:visible}.pending-badge{position:absolute;top:-9px;right:-9px;min-width:22px;height:22px;padding:0 5px;display:none;align-items:center;justify-content:center;border-radius:50px;background:#ef233c;color:#fff;border:2px solid #fff;font:700 11px Arial,sans-serif;line-height:1;z-index:10}.pending-badge.visible{display:inline-flex}';document.head.appendChild(style);
  async function refresh(){try{const r=await fetch('/api/admin/game-requests',{credentials:'include',cache:'no-store'});if(!r.ok)return;const d=await r.json();const n=(d.requests||[]).filter(x=>x.status==='pending').length;badge.textContent=n>99?'99+':String(n);badge.classList.toggle('visible',n>0)}catch(e){}}
  refresh();setInterval(refresh,15000);
})();
