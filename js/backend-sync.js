(() => {
  const API = document.querySelector('meta[name="tcr-api-base"]')?.content || "https://admin.teamclassicrollers.club";
  const assetUrl = p => String(p||"").startsWith("/uploads/") ? API + p : p;
  const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function getData(){try{const r=await fetch(`${API}/api/public/site-data`,{cache:"no-store"});if(!r.ok)throw 0;return await r.json()}catch{return null}}
  function stats(m){const avg=m.games>0?m.scores/m.games:0;const base=Math.max(25,Number(m.goal)||175);const goal=avg>=base?base+(Math.floor((avg-base)/25)+1)*25:base;return {avg,goal,percent:Math.min(100,Math.max(0,avg/goal*100))}}
  function renderTeam(data){
    const blocks=[...document.querySelectorAll(".team-block")];
    if(!blocks.length)return;
    ["Team A","Team B","Team C"].forEach((team,i)=>{
      const block=blocks[i];if(!block)return;
      const grid=block.querySelector(".member-grid");if(!grid)return;
      const list=data.members.filter(m=>m.team===team&&m.active!==false).sort((a,b)=>a.sortOrder-b.sortOrder);
      grid.innerHTML=list.map(m=>`<a class="member-card" href="member.html?id=${encodeURIComponent(m.id)}" aria-label="View ${esc(m.name)} profile"><img src="${esc(assetUrl(m.photo))}" alt="${esc(m.name)}"><h3>${esc(m.name)}</h3><div class="member-card-stats">${m.games} games · ${stats(m).avg.toFixed(1)} avg</div></a>`).join("");
      const kicker=block.querySelector(".section-kicker");if(kicker)kicker.textContent=`${team.toUpperCase()} · ${list.length} MEMBERS`;
    });
  }
  function renderProfile(data){
    const box=document.querySelector("#memberStats");if(!box)return;
    const id=box.dataset.memberKey;
    const m=data.members.find(x=>x.id===id||x.slug===id);if(!m)return;
    const s=stats(m),goal=s.goal;
    const put=(sel,v)=>{const e=document.querySelector(sel);if(e)e.textContent=v};
    put("#totalGames",m.games);put("#totalScores",m.scores);put("#averageScore",s.avg.toFixed(1));
    put("#averageGoalValue",`${s.avg.toFixed(1)} / ${goal}`);
    const fill=document.querySelector("#averageGoalFill");if(fill)fill.style.width=`${s.percent}%`;
    put("#averageGoalText",`${s.percent.toFixed(0)}% of ${goal} goal`);
  }
  function renderGenericProfile(data){
    const target=document.querySelector("#genericMember");if(!target)return;
    const id=new URLSearchParams(location.search).get("id");
    const m=data.members.find(x=>x.id===id);if(!m){target.innerHTML="<p>Member not found.</p>";return}
    const s=stats(m);
    target.innerHTML=`<div class="member-profile-card"><img class="member-profile-photo" src="${esc(assetUrl(m.photo))}" alt="${esc(m.name)}"><div class="member-profile-info"><span class="member-profile-team">${esc(m.team)}</span><h1>${esc(m.name)}</h1><p>Official team statistics.</p><div class="member-stats"><div class="member-stat"><span>Total Games</span><strong>${m.games}</strong></div><div class="member-stat"><span>Total Scores</span><strong>${m.scores}</strong></div><div class="member-stat"><span>Average Score</span><strong>${s.avg.toFixed(1)}</strong></div></div><div class="average-goal"><div class="average-goal-head"><span>Average Score Goal</span><strong>${s.avg.toFixed(1)} / ${s.goal}</strong></div><div class="average-goal-track"><div class="average-goal-fill" style="width:${s.percent}%"></div></div><span class="average-goal-text">${s.percent.toFixed(0)}% of ${s.goal} goal</span></div></div></div>`;
    const hero=document.querySelector(".page-hero");if(hero){hero.querySelector("h1").textContent=m.name;hero.querySelector(".section-kicker").textContent=m.team}
    document.title=`${m.name} | Team Classic Rollers`;
  }
  function renderNews(data){
    const items=(data.news||[]).filter(n=>n.published!==false);if(!items.length)return;
    let section=document.querySelector("#tcrNews");if(!section){section=document.createElement("section");section.id="tcrNews";section.className="tcr-news-section";section.innerHTML='<div class="tcr-news-inner"><p class="section-kicker">LATEST FROM TCR</p><h2>News & Tournament Updates</h2><div class="tcr-news-grid"></div></div>';const footer=document.querySelector("footer");(footer?.parentNode||document.body).insertBefore(section,footer||null)}
    const grid=section.querySelector(".tcr-news-grid");grid.innerHTML=items.slice(0,6).map(n=>`<article class="tcr-news-card"><span>${esc(n.type||"Announcement")} · ${esc(n.date||"")}</span><h3>${esc(n.title)}</h3><p>${esc(n.body).replace(/\n/g,"<br>")}</p></article>`).join("");
  }
  function renderMemberDetails(data){
    const idBox=document.querySelector("#memberStats");const generic=document.querySelector("#genericMember");let id=idBox?.dataset.memberKey||new URLSearchParams(location.search).get("id");if(!id)return;const m=data.members.find(x=>x.id===id||x.slug===id);if(!m)return;
    const parent=generic||idBox?.parentElement;if(!parent)return;let box=document.querySelector("#tcrMemberDetails");if(!box){box=document.createElement("section");box.id="tcrMemberDetails";box.className="tcr-member-details";parent.appendChild(box)}
    const achievements=Array.isArray(m.achievements)?m.achievements:[];box.innerHTML=`${m.bio?`<div><h2>About ${esc(m.name)}</h2><p>${esc(m.bio)}</p></div>`:""}${achievements.length?`<div><h2>Achievements</h2><ul>${achievements.map(a=>`<li>${esc(a)}</li>`).join("")}</ul></div>`:""}<div><h2>Recent Score History</h2><p class="tcr-history-loading">Loading score history…</p><div class="tcr-history-list"></div></div>`;
    fetch(`${API}/api/public/member-history/${encodeURIComponent(m.id)}`).then(r=>r.ok?r.json():null).then(j=>{const list=box.querySelector(".tcr-history-list");if(!list||!j)return;list.innerHTML=j.history.length?j.history.map(h=>`<div class="tcr-history-row"><span>${esc(h.reason||h.action.replaceAll("_"," "))}</span><strong>${h.newScores!==undefined?Number(h.newScores):"—"}</strong><small>${esc(new Date(h.timestamp).toLocaleDateString())}</small></div>`).join(""):"<p>No score changes recorded yet.</p>";const loading=box.querySelector(".tcr-history-loading");if(loading)loading.remove()}).catch(()=>{});
  }
  function renderRankings(data){
    const old=document.querySelector(".gallery-section");if(!old)return;
    const section=document.createElement("section");section.className="section gallery-section tcr-rankings";section.id="rankings";
    section.innerHTML='<div class="container"><div class="section-heading"><div><p class="section-kicker">TEAM LEADERBOARD</p><h2>Top 3 Rankings.</h2></div><a class="text-link" href="team.html">Meet the team →</a></div><div class="ranking-grid"></div></div>';
    const grid=section.querySelector('.ranking-grid');
    const teams=['Team A','Team B','Team C'];
    grid.innerHTML=teams.map(team=>{const list=data.members.filter(m=>m.team===team&&m.active!==false).sort((a,b)=>stats(b).avg-stats(a).avg).slice(0,3);return `<article class="ranking-team"><h3>${esc(team)} <span>TOP 3</span></h3>${list.length?list.map((m,i)=>`<a class="ranking-row" href="member.html?id=${encodeURIComponent(m.id)}"><span class="ranking-place">${i+1}</span><img src="${esc(assetUrl(m.photo))}" alt=""><span class="ranking-name">${esc(m.name)}</span><strong>${stats(m).avg.toFixed(1)} <small>AVG</small></strong></a>`).join(''):'<p>No ranking data yet.</p>'}</article>`}).join('');
    old.replaceWith(section);
  }
  function renderContent(data){
    const c=data.content||{};
    const homeH=document.querySelector(".hero-content h1");if(homeH&&c.homeTitle)homeH.innerHTML=esc(c.homeTitle).replace(/\n/g,"<br>");
    const homeP=document.querySelector(".hero-content>p:not(.eyebrow)");if(homeP&&c.homeDescription)homeP.textContent=c.homeDescription;
    const aboutHero=document.querySelector(".page-hero h1");if(aboutHero&&location.pathname.endsWith("about.html")&&c.aboutTitle)aboutHero.textContent=c.aboutTitle;
    const aboutHeroP=document.querySelector(".page-hero p:last-child");if(aboutHeroP&&location.pathname.endsWith("about.html")&&c.aboutDescription)aboutHeroP.textContent=c.aboutDescription;
    const aboutH=[...document.querySelectorAll(".about-grid h2")][0];if(aboutH&&c.aboutHeading)aboutH.textContent=c.aboutHeading;
    const aboutPs=document.querySelectorAll(".about-grid p:not(.section-kicker)");if(aboutPs[0]&&c.aboutBody)aboutPs[0].textContent=c.aboutBody;if(aboutPs[1]&&c.aboutBody2)aboutPs[1].textContent=c.aboutBody2;
  }
  document.addEventListener("DOMContentLoaded",async()=>{const data=await getData();if(!data)return;renderTeam(data);renderRankings(data);renderProfile(data);renderGenericProfile(data);renderContent(data);renderNews(data);renderMemberDetails(data)});
})();