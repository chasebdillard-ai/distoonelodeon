/* Dis-Toon-elodeon front-end. Vanilla JS, hash routing, data read at runtime. */
(function () {
  'use strict';

  /* ---------- config (brand identity only, no content) ---------- */
  const ORDER = ['disney', 'disneyjr', 'cn', 'nick', 'nickjr', 'nickrewind', 'pbskids'];
  const HUBS = {
    disney: { name: 'Disney Channel', short: 'Disney', logo: 'img-disney.png', tag: 'Your Disney Channel favorites, full episodes on demand.' },
    disneyjr: { name: 'Disney Jr.', short: 'Disney Jr.', logo: 'img-disneyjr.png', tag: 'Big adventures for little ones. Press play and sing along!' },
    cn: { name: 'Cartoon Network', short: 'Cartoon Network', logo: 'img-cn.png', tag: 'Cartoons that rule. Full episodes and marathons straight from the CN vault.' },
    nick: { name: 'Nickelodeon', short: 'Nick', logo: 'img-nick.png', tag: 'Get slimed with full episodes and mega-marathons of your Nick faves.' },
    nickjr: { name: 'Nick Jr.', short: 'Nick Jr.', logo: 'img-nickjr.png', tag: 'Hours of preschool fun with all your Nick Jr. friends.' },
    nickrewind: { name: 'NickRewind', short: 'Rewind', logo: 'img-nickrewind.png', tag: 'Be kind, rewind. The classic Nick shows you grew up with.' },
    pbskids: { name: 'PBS KIDS', short: 'PBS KIDS', logo: 'img-pbskids.png', tag: 'Full episodes and full movies from your PBS KIDS friends, sorted by show and in order.', ordered: true }
  };
  const PAGE = 60;
  const RAIL = 20;
  const LS_CW = 'dtn_cw', LS_LIST = 'dtn_list';

  /* ---------- helpers ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (d) => (d && d.length >= 6 ? MONTHS[(+d.slice(4, 6)) - 1] + ' ' + d.slice(0, 4) : '');
  function fmtDur(s) {
    s = +s || 0; if (!s) return '';
    const tm = Math.max(1, Math.round(s / 60)), h = Math.floor(tm / 60), m = tm % 60;
    if (!h) return tm + 'm';
    return m ? h + 'h ' + m + 'm' : h + 'h';
  }
  const fmtNum = (n) => (+n || 0).toLocaleString('en-US');
  const thumb = (id, q) => 'https://i.ytimg.com/vi/' + id + '/' + (q || 'mqdefault') + '.jpg';
  const kindLabel = (k) => (k === 'M' ? 'Marathon' : k === 'F' ? 'Full Movie' : 'Full Episode');
  const isMore = (s) => /^More /.test(s);
  function cleanTitle(t, show) {
    const parts = String(t).split(/\s+\|\s+/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return t;
    let p = parts[0];
    if (parts.length > 1 && show && p.toLowerCase() === String(show).toLowerCase()) p = parts[1];
    p = p.replace(/^full episodes?\s*[:\-–—]\s*/i, '');
    p = p.replace(/[\s:\-–—]*\bfull episode!?\s*$/i, '').replace(/[\s:\-–—|,]+$/, '').replace(/\s{2,}/g, ' ').trim();
    return p.length >= 4 ? p : t;
  }
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
  const PBS_JUNK = /^(pbs kids|cartoons? for kids|kids cartoons?|kids movies?|videos? for kids|kids videos?|stem shows? for kids|full episodes?|full eps?|full movie|hd|.*\bpodcast)$/i;
  function pbsTitle(t, show) {
    const sh = String(show || '').replace(/ en Español$/, '').toLowerCase();
    const parts = String(t).replace(EMOJI, ' ').split(/\s*[|｜]\s*/).map((x) => x
      .replace(/\b(full[\s-]*(episodes?|eps?|movie|length)|episodios? completos?|new show|compilation|movie)\b!?/ig, ' ')
      .replace(/\(\s*\)/g, ' ').replace(/\s{2,}/g, ' ').trim().replace(/^[\s:\-–—!,]+|[\s:\-–—,]+$/g, '').trim());
    for (let i = 0; i < parts.length; i++) {
      let p = parts[i]; if (!p) continue;
      const low = p.toLowerCase();
      if (PBS_JUNK.test(p) || (sh && (low === sh || low === sh.replace(/!$/, '')))) continue;
      if (sh && low.startsWith(sh + ' ') && i === 0 && parts.slice(1).some((q) => q && !PBS_JUNK.test(q))) continue;
      if (sh && low.startsWith(sh + ':')) p = p.slice(sh.length + 1).trim() || p;
      return p.length >= 3 ? p : t;
    }
    return String(t).replace(EMOJI, '').trim();
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* quota */ } }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }

  /* ---------- data ---------- */
  const store = { index: null, hubs: {}, pending: {}, lists: [] };
  function loadIndex() {
    if (!store.pending.index) store.pending.index = fetch('data-index.json', { cache: 'no-cache' }).then((r) => r.json()).then((j) => (store.index = j)).catch(() => (store.index = { hubs: {} }));
    return store.pending.index;
  }
  function loadHub(key) {
    if (store.hubs[key]) return Promise.resolve(store.hubs[key]);
    if (!store.pending[key]) {
      store.pending[key] = fetch('data-' + key + '.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => {
        const ord = HUBS[key] && HUBS[key].ordered;
        const videos = (j.v || []).map((a) => ({ id: a[0], t: a[1], ct: ord ? pbsTitle(a[1], a[4]) : cleanTitle(a[1], a[4]), d: a[2] || 0, date: a[3] || '', show: a[4] || '', k: a[5] === 'M' ? 'M' : a[5] === 'F' ? 'F' : 'E', ch: a[6] || '', hub: key, o: a[7] == null ? null : +a[7], lbl: a[8] || '' }));
        const byShow = new Map();
        videos.forEach((v) => { if (!byShow.has(v.show)) byShow.set(v.show, []); byShow.get(v.show).push(v); });
        if (ord) byShow.forEach((L) => L.sort((a, b) => (a.o == null ? 1e9 : a.o) - (b.o == null ? 1e9 : b.o))); // watch order: S/E or oldest -> newest
        const shows = (j.shows || []).filter((s) => byShow.has(s.s));
        const ordered = shows.filter((s) => !isMore(s.s)).concat(shows.filter((s) => isMore(s.s)));
        const hub = { key, videos, E: videos.filter((v) => v.k === 'E'), M: videos.filter((v) => v.k === 'M'), F: videos.filter((v) => v.k === 'F'), byShow, shows: ordered };
        store.hubs[key] = hub; return hub;
      }).catch((e) => { delete store.pending[key]; const hub = { key, videos: [], E: [], M: [], F: [], byShow: new Map(), shows: [], error: true }; return hub; });
    }
    return store.pending[key];
  }
  const loadAll = () => Promise.all(ORDER.map(loadHub));
  function reg(arr) { store.lists.push(arr); return store.lists.length - 1; }
  function stats(key) {
    const s = (store.index && store.index.hubs && store.index.hubs[key]) || null;
    const h = store.hubs[key];
    if (h && !h.error) return { videos: h.videos.length, episodes: h.E.length, marathons: h.M.length, movies: h.F.length, shows: h.shows.filter((x) => !isMore(x.s)).length || h.shows.length };
    return s || { videos: 0, episodes: 0, marathons: 0, movies: 0, shows: 0 };
  }
  function mixRoundRobin(lists, n) {
    const out = []; const idx = lists.map(() => 0);
    while (out.length < n) {
      let added = false;
      for (let i = 0; i < lists.length && out.length < n; i++) { if (idx[i] < lists[i].length) { out.push(lists[i][idx[i]++]); added = true; } }
      if (!added) break;
    }
    return out;
  }

  /* ---------- local state: continue watching + my list ---------- */
  const pick = (v) => ({ id: v.id, t: v.t, ct: v.ct || cleanTitle(v.t, v.show), d: v.d, date: v.date, show: v.show, k: v.k, ch: v.ch, hub: v.hub, lbl: v.lbl || '' });
  const getCW = () => lsGet(LS_CW);
  function saveCW(v, pos) {
    if (!v || !(pos > 0)) return;
    let cw = getCW().filter((x) => x.id !== v.id);
    const dur = +v.d || 0;
    if (dur && pos > dur - 25) { lsSet(LS_CW, cw); return; } // finished
    if (pos < 8) return;
    cw.unshift(Object.assign(pick(v), { pos: Math.floor(pos), ts: Date.now() }));
    lsSet(LS_CW, cw.slice(0, 40));
  }
  function cwPos(id) { const x = getCW().find((c) => c.id === id); return x ? x.pos : 0; }
  const getList = () => lsGet(LS_LIST);
  const inList = (id) => getList().some((x) => x.id === id);
  function toggleList(v) {
    let l = getList(); const had = l.some((x) => x.id === v.id);
    l = had ? l.filter((x) => x.id !== v.id) : [pick(v)].concat(l);
    lsSet(LS_LIST, l);
    $$('[data-add="' + v.id + '"]').forEach(syncAddBtn);
    if (P.v && P.v.id === v.id) syncPlayerAdd();
    toast(had ? 'Removed from My List' : 'Added to My List');
    if (route.name === 'mylist' && had) render();
  }
  function syncAddBtn(b) {
    const on = inList(b.dataset.add);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const t = b.querySelector('.ttl'); const label = (on ? 'Remove from My List: ' : 'Add to My List: ') + (b.dataset.title || '');
    b.setAttribute('aria-label', label);
    b.querySelector('i').textContent = on ? '✓' : '+';
    if (t) t.textContent = on ? 'In My List' : 'My List';
  }
  const videoIndex = new Map();
  function remember(arr) { arr.forEach((v) => videoIndex.set(v.id, v)); }

  /* ---------- templates ---------- */
  function netBadge(hub) { return '<span class="netb netb-' + hub + '">' + esc(HUBS[hub] ? HUBS[hub].short : hub) + '</span>'; }
  function card(v, l, i, opts) {
    opts = opts || {};
    remember([v]);
    const lbl = 'Play ' + v.ct + ', ' + v.show + ', ' + kindLabel(v.k) + ', ' + fmtDur(v.d);
    const meta = (opts.inshow ? [v.lbl || (v.n ? '#' + v.n : ''), fmtDate(v.date)] : [isMore(v.show) ? '' : v.show, v.lbl, fmtDate(v.date)]).filter(Boolean).join(' · ');
    const prog = opts.cw && v.d ? '<span class="prog"><b style="width:' + Math.min(100, Math.round((v.pos / v.d) * 100)) + '%"></b></span>' : '';
    const side = opts.cw
      ? '<button type="button" class="card-x" data-cwrm="' + v.id + '" aria-label="Remove ' + esc(v.ct) + ' from Continue Watching"><i>×</i></button>'
      : '<button type="button" class="card-add" data-add="' + v.id + '" data-title="' + esc(v.ct) + '" aria-pressed="' + inList(v.id) + '" aria-label="' + (inList(v.id) ? 'Remove from' : 'Add to') + ' My List: ' + esc(v.ct) + '"><i>' + (inList(v.id) ? '✓' : '+') + '</i></button>';
    return '<article class="card k' + v.k + '">' +
      '<button type="button" class="card-hit" data-l="' + l + '" data-i="' + i + '" aria-label="' + esc(lbl) + '" title="' + esc(v.t) + '">' +
      '<span class="thumb"><img src="' + thumb(v.id) + '" alt="" loading="lazy" decoding="async" width="320" height="180">' +
      '<span class="kind">' + kindLabel(v.k) + '</span>' +
      '<span class="dur">' + fmtDur(v.d) + '</span>' + (opts.net ? netBadge(v.hub) : '') + prog + '</span>' +
      '<span class="cbody"><span class="ctitle">' + esc(v.ct) + '</span><span class="cmeta">' + esc(meta || HUBS[v.hub].name) + '</span></span>' +
      '</button>' + side + '</article>';
  }
  function rail(title, list, opts) {
    opts = opts || {};
    if (!list || !list.length) return '';
    const shown = list.slice(0, opts.max || RAIL); const l = reg(opts.full || list);
    const id = 'r' + l;
    return '<section class="rail' + (opts.cls ? ' ' + opts.cls : '') + '"' + (opts.id ? ' id="' + opts.id + '"' : '') + (opts.hub ? ' data-hub="' + opts.hub + '"' : '') + ' aria-labelledby="' + id + '">' +
      '<div class="rail-head"><h2 id="' + id + '">' + (opts.logo ? '<img class="rail-logo" src="' + HUBS[opts.hub].logo + '" alt="">' : '') + '<span>' + esc(title) + '</span>' + (opts.count ? ' <small>' + fmtNum(opts.count) + '</small>' : '') + '</h2>' +
      (opts.more ? '<a class="see" href="' + opts.more + '">See all<span aria-hidden="true"> ›</span></a>' : '') + '</div>' +
      '<div class="rail-wrap"><button type="button" class="rail-arr prev" data-scroll="-1" aria-label="Scroll ' + esc(title) + ' left">‹</button>' +
      '<div class="rail-track">' + shown.map((v, i) => card(v, l, i, opts)).join('') + '</div>' +
      '<button type="button" class="rail-arr next" data-scroll="1" aria-label="Scroll ' + esc(title) + ' right">›</button></div></section>';
  }
  function cwRail(hub) {
    let cw = getCW(); if (hub) cw = cw.filter((c) => c.hub === hub);
    if (!cw.length) return '';
    const l = reg(cw);
    return '<section class="rail rail-cw" aria-labelledby="cwh"><div class="rail-head"><h2 id="cwh"><span>Continue Watching</span></h2></div>' +
      '<div class="rail-wrap"><div class="rail-track">' + cw.slice(0, RAIL).map((v, i) => card(v, l, i, { cw: true, net: !hub })).join('') + '</div></div></section>';
  }
  function grid(list, opts) {
    opts = opts || {};
    const l = reg(list);
    return '<div class="grid" data-gl="' + l + '"' + (opts.net ? ' data-net="1"' : '') + (opts.inshow ? ' data-inshow="1"' : '') + '>' + list.slice(0, PAGE).map((v, i) => card(v, l, i, opts)).join('') + '</div>' + moreBtn(l, PAGE);
  }
  function moreBtn(l, shown) {
    const left = store.lists[l].length - shown;
    return left > 0 ? '<div class="more-wrap"><button type="button" class="btn btn-more" data-more="' + l + '" data-shown="' + shown + '">Load more <small>(' + fmtNum(left) + ' left)</small></button></div>' : '';
  }
  function skeleton(rails) {
    let h = '<div class="skel-hero skel"></div>';
    for (let r = 0; r < (rails || 3); r++) {
      h += '<section class="rail"><div class="rail-head"><span class="skel skel-h"></span></div><div class="rail-wrap"><div class="rail-track">';
      for (let i = 0; i < 6; i++) h += '<div class="card skel-card"><span class="thumb skel"></span><span class="skel skel-t"></span><span class="skel skel-t2"></span></div>';
      h += '</div></div></section>';
    }
    return '<div aria-busy="true" aria-label="Loading">' + h + '</div>';
  }
  function showTile(hub, s) {
    const h = store.hubs[hub]; const vids = h.byShow.get(s.s) || []; const v = vids[0];
    return '<a class="show-tile" href="#' + hub + '/show/' + encodeURIComponent(s.s) + '" aria-label="' + esc(s.s) + ', ' + s.n + (s.n === 1 ? ' video">' : ' videos">') +
      '<span class="thumb">' + (v ? '<img src="' + thumb(v.id) + '" alt="" loading="lazy" decoding="async" width="320" height="180">' : '') + '</span>' +
      '<span class="st-name">' + esc(s.s) + '</span><span class="st-count">' + fmtNum(s.n) + (s.n === 1 ? ' video' : ' videos') + (s.e ? ' · ' + fmtNum(s.e) + (s.e === 1 ? ' ep' : ' eps') : '') + '</span></a>';
  }
  function wordmark() {
    return '<span class="wm" aria-hidden="true"><span class="wm-dis">Dis</span><span class="wm-dash">-</span><span class="wm-toon"><b>T</b><b>o</b><b>o</b><b>n</b></span><span class="wm-dash">-</span><span class="wm-elo">elodeon</span></span>';
  }

  /* ---------- routing ---------- */
  let route = { name: 'home' };
  function parse() {
    const raw = location.hash.replace(/^#\/?/, '');
    const p = raw.split('/');
    const head = p[0] || 'home';
    if (head === 'home' || head === '') return { name: 'home' };
    if (head === 'search') return { name: 'search', q: p.slice(1).join('/') ? decodeURIComponent(p.slice(1).join('/')) : '' };
    if (head === 'mylist') return { name: 'mylist' };
    if (head === 'live') return LIVE[p[1]] ? { name: 'live', ch: p[1], hub: LIVE[p[1]].theme } : { name: 'live' };
    if (HUBS[head]) {
      if (p[1] === 'show' && p.length > 2) { let s = p.slice(2).join('/'); try { s = decodeURIComponent(s); } catch (e) { /* keep raw */ } return { name: 'show', hub: head, show: s }; }
      if (p[1] === 'all' && (p[2] === 'E' || p[2] === 'M' || p[2] === 'F')) return { name: 'all', hub: head, kind: p[2] };
      return { name: 'hub', hub: head };
    }
    return { name: 'home' };
  }
  let renderSeq = 0, liveRefocus = null;
  function setTheme(hub) {
    document.body.className = 'hub-' + (hub || 'home');
    const brand = $('#brand');
    if (hub) {
      const logo = hub === 'cn' ? 'img-cn.png' : HUBS[hub].logo;
      brand.innerHTML = '<img src="' + logo + '" alt="' + esc(HUBS[hub].name) + '">';
      brand.href = '#' + hub; brand.setAttribute('aria-label', HUBS[hub].name + ' home');
    } else {
      brand.innerHTML = wordmark(); brand.href = '#home'; brand.setAttribute('aria-label', 'Dis-Toon-elodeon home');
    }
    const tc = { home: '#0b0b12', disney: '#06123a', disneyjr: '#ffffff', cn: '#ffffff', nick: '#ff6600', nickjr: '#5b4bd6', nickrewind: '#1d0a3a', pbskids: '#2638c4' }[hub || 'home'];
    const m = $('meta[name="theme-color"]'); if (m) m.content = tc;
  }
  function setTabs() {
    const n = route.name;
    $$('[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === (['home', 'search', 'mylist', 'live'].includes(n) ? n : 'networks')));
    $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (['home', 'mylist', 'live'].includes(n) ? n : (n === 'search' ? '' : 'networks'))));
  }
  async function render() {
    const seq = ++renderSeq;
    route = parse();
    store.lists = [];
    stopHero();
    stopLive();
    const app = $('#app');
    setTheme(route.hub);
    setTabs();
    window.scrollTo(0, 0);
    const done = (html, title) => { if (seq !== renderSeq) return false; store.lists = store.lists; app.innerHTML = html; document.title = title ? title + ' · Dis-Toon-elodeon' : 'Dis-Toon-elodeon · Free cartoons, full episodes & marathons'; return true; };
    try {
      if (route.name === 'home') {
        app.innerHTML = skeleton(3);
        await loadIndex(); await loadAll(); if (seq !== renderSeq) return;
        store.lists = [];
        if (done(homeHTML())) { initHero(); startHomeLive(); }
      } else if (route.name === 'hub') {
        app.innerHTML = skeleton(3);
        await loadIndex(); await loadHub(route.hub); if (seq !== renderSeq) return;
        store.lists = [];
        done(hubHTML(route.hub), HUBS[route.hub].name);
      } else if (route.name === 'show') {
        app.innerHTML = skeleton(2);
        await loadHub(route.hub); if (seq !== renderSeq) return;
        store.lists = [];
        done(showHTML(route.hub, route.show), route.show);
      } else if (route.name === 'all') {
        app.innerHTML = skeleton(2);
        await loadHub(route.hub); if (seq !== renderSeq) return;
        store.lists = [];
        done(allHTML(route.hub, route.kind), kindTitle(route.kind) + ' · ' + HUBS[route.hub].name);
      } else if (route.name === 'search') {
        done(searchShellHTML(route.q), 'Search');
        const inp = $('#q');
        loadAll().then(() => { if (seq === renderSeq) runSearch(); });
        if (inp && !route.q && window.matchMedia('(hover:hover)').matches) inp.focus();
      } else if (route.name === 'mylist') {
        done(myListHTML(), 'My List');
      } else if (route.name === 'live' && route.ch) {
        app.innerHTML = skeleton(1);
        await renderLiveChannel(route.ch, seq);
        if (seq !== renderSeq) return;
        const want = liveRefocus; liveRefocus = null;
        if (want) { const b = $('[data-chan="' + want + '"]'); if (b) { b.focus({ preventScroll: true }); if (window.__tvnav) window.__tvnav.focus(b, false); } }
        else if (window.__tvnav && tvSize()) setTimeout(() => { if (seq !== renderSeq) return; const f = $('#lv-frame iframe') || $('[data-chan]'); if (f) window.__tvnav.focus(f, false); const s = $('#lv-stage'); if (s) window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY); }, 900);
      } else if (route.name === 'live') {
        app.innerHTML = skeleton(2);
        await Promise.all(LIVE_ORDER.map(liveHubsReady)); if (seq !== renderSeq) return;
        store.lists = [];
        done(liveGuideHTML(), 'Live TV');
      }
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="empty"><h2>Something went sideways.</h2><p>We could not load this page.</p><a class="btn" href="#home">Back home</a></div>';
    }
    $$('[data-add]', app).forEach(syncAddBtn);
    bindFallbacks(app);
    updateArrows();
  }

  /* ---------- pages ---------- */
  const kindTitle = (k) => (k === 'M' ? 'Marathons' : k === 'F' ? 'Full Movies' : 'Full Episodes');
  function homeHTML() {
    const hubs = ORDER.map((k) => store.hubs[k]);
    const feat = hubs.map((h) => h.E[0] || h.videos[0]).filter(Boolean);
    const fl = reg(feat);
    const pk = store.hubs.pbskids && !store.hubs.pbskids.error ? store.hubs.pbskids : null, pst = pk ? stats('pbskids') : null, nSl = feat.length + (pk ? 1 : 0);
    const promo = pk ? '<article class="slide slide-promo slide-pbskids" aria-roledescription="slide" aria-label="1 of ' + nSl + '">' +
      '<img class="slide-img" src="img-pbs-launch.jpg" alt="" fetchpriority="high" decoding="async"><div class="slide-shade"></div>' +
      '<div class="slide-info"><span class="slide-logo slide-logo-pbskids promo-logo"><img src="' + HUBS.pbskids.logo + '" alt="PBS KIDS"></span>' +
      '<p class="slide-kicker">New on Dis-Toon-elodeon</p><h2 class="slide-title">PBS KIDS is here!</h2>' +
      '<p class="slide-meta">' + fmtNum(pst.videos) + ' full episodes &amp; movies · ' + pst.shows + ' shows · every show in order</p>' +
      '<div class="slide-btns"><a class="btn btn-play" href="#pbskids"><i aria-hidden="true">▶</i> Explore PBS KIDS</a>' +
      '<a class="btn btn-ghost" href="#live/pbskids">PBS KIDS 24/7</a></div></div></article>' : '';
    let h = '<section class="hero" aria-roledescription="carousel" aria-label="Featured">' +
      '<div class="hero-track" id="hero-track">' + promo + feat.map((v, i) => {
        remember([v]);
        return '<article class="slide slide-' + v.hub + '" aria-roledescription="slide" aria-label="' + (i + 1 + (pk ? 1 : 0)) + ' of ' + nSl + '">' +
          '<img class="slide-img" src="' + thumb(v.id, 'maxresdefault') + '" data-fb="' + thumb(v.id, 'hqdefault') + '" alt="" ' + (i || pk ? 'loading="lazy"' : 'fetchpriority="high"') + ' decoding="async">' +
          '<div class="slide-shade"></div>' +
          '<div class="slide-info"><span class="slide-logo slide-logo-' + v.hub + '"><img src="' + HUBS[v.hub].logo + '" alt="' + esc(HUBS[v.hub].name) + '"></span>' +
          '<p class="slide-kicker">' + (v.k === 'M' ? 'New Marathon' : 'New Full Episode') + (isMore(v.show) ? '' : ' · ' + esc(v.show)) + '</p>' +
          '<h2 class="slide-title">' + esc(v.ct) + '</h2>' +
          '<p class="slide-meta">' + [fmtDur(v.d), fmtDate(v.date)].filter(Boolean).join(' · ') + '</p>' +
          '<div class="slide-btns"><button type="button" class="btn btn-play" data-l="' + fl + '" data-i="' + i + '"><i aria-hidden="true">▶</i> Play</button>' +
          '<button type="button" class="btn btn-ghost card-add-wide" data-add="' + v.id + '" data-title="' + esc(v.ct) + '"><i>+</i><span class="ttl">My List</span></button></div></div></article>';
      }).join('') + '</div><div class="dots" id="hero-dots">' + Array.from({ length: nSl }, (_, i) => '<button type="button" class="dot" data-dot="' + i + '" aria-label="Show slide ' + (i + 1) + '"></button>').join('') + '</div></section>';
    h += liveRailHTML();
    h += '<p class="home-tag">Disney <span>·</span> Cartoon Network <span>·</span> Nickelodeon <span>·</span> PBS KIDS. Full episodes, movies &amp; marathons, free.</p>';
    h += cwRail();
    h += '<section class="nets" aria-labelledby="nets-h"><div class="rail-head"><h2 id="nets-h"><span>Networks</span></h2></div><div class="net-grid">' +
      ORDER.map((k) => { const s = stats(k); return '<a class="net-tile net-' + k + '" href="#' + k + '" aria-label="' + esc(HUBS[k].name) + ', ' + fmtNum(s.videos) + ' videos"><span class="net-logo"><img src="' + (HUBS[k].logo) + '" alt=""></span><span class="net-count">' + fmtNum(s.videos) + ' videos</span></a>'; }).join('') + '</div></section>';
    const latestE = mixRoundRobin(hubs.map((x) => x.E.slice(0, 8)), 40).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const latestM = mixRoundRobin(hubs.map((x) => x.M.slice(0, 8)), 40).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    h += rail('Latest Full Episodes', latestE, { net: true, max: 30 });
    h += rail('Marathons', latestM, { net: true, max: 30 });
    hubs.forEach((x) => { h += rail(HUBS[x.key].name, x.videos, { hub: x.key, logo: true, more: '#' + x.key, cls: 'rail-hub', count: stats(x.key).videos }); });
    return h;
  }
  function hubHTML(key) {
    const h = store.hubs[key]; const s = stats(key); const meta = HUBS[key];
    const newest = h.E[0] || h.videos[0];
    let o = '<section class="hub-hero"><div class="hh-deco" aria-hidden="true"></div><div class="hh-in">' +
      '<h1 class="hh-logo"><img src="' + meta.logo + '" alt="' + esc(meta.name) + '"></h1>' +
      '<p class="hh-tag">' + esc(meta.tag) + '</p>' +
      '<ul class="hh-stats">' +
      '<li><b>' + fmtNum(s.videos) + '</b><span>videos</span></li>' +
      '<li><b>' + fmtNum(s.episodes) + '</b><span>full episodes</span></li>' +
      (h.F && h.F.length ? '<li><b>' + fmtNum(h.F.length) + '</b><span>full movies</span></li>' : '<li><b>' + fmtNum(s.marathons) + '</b><span>marathons</span></li>') +
      '<li><b>' + fmtNum(s.shows) + '</b><span>shows</span></li></ul>' +
      (newest ? '<button type="button" class="btn btn-play" data-l="' + reg(h.E.length ? h.E : h.videos) + '" data-i="0"><i aria-hidden="true">▶</i> Play newest ' + (newest.k === 'E' ? 'episode' : 'video') + '</button>' : '') +
      '</div>' + (key === 'nick' || key === 'nickjr' ? '<svg class="drip" viewBox="0 0 390 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h390v14c-14 0-14 18-28 18s-10-14-26-14-12 24-30 24-14-22-30-22-12 10-26 10-12-16-28-16-14 26-32 26-14-20-30-20-12 8-26 8-14-18-30-18-12 22-30 22-14-16-28-16-12 10-26 10S16 14 0 14z"/></svg>' : '') + '</section>';
    if (h.error) o += '<div class="empty"><p>Could not load ' + esc(meta.name) + ' right now.</p></div>';
    const hasF = h.F && h.F.length;
    o += '<nav class="subtabs" aria-label="' + esc(meta.name) + ' sections"><a href="#sec-E" data-jump="sec-E">Full Episodes</a>' + (hasF ? '<a href="#sec-F" data-jump="sec-F">Full Movies</a>' : '') + (h.M.length ? '<a href="#sec-M" data-jump="sec-M">Marathons</a>' : '') + '<a href="#sec-shows" data-jump="sec-shows">Shows</a></nav>';
    o += cwRail(key);
    o += rail('Full Episodes', h.E, { id: 'sec-E', more: '#' + key + '/all/E', count: h.E.length });
    if (hasF) o += rail('Full Movies', h.F, { id: 'sec-F', more: '#' + key + '/all/F', count: h.F.length, cls: 'rail-movies' });
    o += rail('Marathons', h.M, { id: 'sec-M', more: '#' + key + '/all/M', count: h.M.length });
    o += '<section class="shows" id="sec-shows" aria-labelledby="sh-h"><div class="rail-head"><h2 id="sh-h"><span>Shows</span> <small>' + h.shows.length + '</small></h2></div><div class="show-grid">' + h.shows.map((x) => showTile(key, x)).join('') + '</div></section>';
    const top = h.shows.filter((x) => !isMore(x.s)).slice(0, 10).concat(h.shows.filter((x) => isMore(x.s)));
    top.forEach((x) => { o += rail(x.s, h.byShow.get(x.s) || [], { more: '#' + key + '/show/' + encodeURIComponent(x.s), count: x.n }); });
    return o;
  }
  function showHTML(key, name) {
    const h = store.hubs[key]; const vids = h.byShow.get(name);
    if (!vids) return '<div class="empty"><h2>Show not found</h2><p>' + esc(name) + ' is not on ' + esc(HUBS[key].name) + ' right now.</p><a class="btn" href="#' + key + '">Back to ' + esc(HUBS[key].name) + '</a></div>';
    const E = vids.filter((v) => v.k === 'E'), M = vids.filter((v) => v.k === 'M'), F = vids.filter((v) => v.k === 'F');
    const all = E.concat(F, M); const ordd = !!HUBS[key].ordered;
    if (ordd) { E.forEach((v, i) => { v.n = i + 1; }); F.forEach((v) => { v.n = 0; }); M.forEach((v) => { v.n = 0; }); }
    let o = '<section class="show-hero"><img class="sh-bg" src="' + thumb(vids[0].id, 'maxresdefault') + '" data-fb="' + thumb(vids[0].id, 'hqdefault') + '" alt=""><div class="sh-shade"></div><div class="sh-in">' +
      '<a class="crumb" href="#' + key + '">‹ ' + esc(HUBS[key].name) + '</a>' +
      '<h1 class="sh-title">' + esc(name) + '</h1>' +
      '<p class="sh-meta">' + [E.length ? E.length + ' full episode' + (E.length > 1 ? 's' : '') : '', F.length ? F.length + (F.length > 1 ? ' movies & specials' : ' movie / special') : '', M.length ? M.length + ' marathon' + (M.length > 1 ? 's' : '') : ''].filter(Boolean).join(' · ') + '</p>' +
      '<button type="button" class="btn btn-play" data-l="' + reg(all) + '" data-i="0"><i aria-hidden="true">▶</i> ' + (ordd && E.length ? 'Play from episode 1' : 'Play all') + '</button></div></section>';
    const gopt = ordd ? { inshow: true } : {};
    if (E.length) o += '<section class="sect" aria-labelledby="se-h"><div class="rail-head"><h2 id="se-h"><span>Full Episodes</span> <small>' + E.length + '</small></h2><button type="button" class="see" data-l="' + reg(E) + '" data-i="0">▶ Play all</button></div>' + (ordd ? '<p class="sect-note">In order: season &amp; episode where known, otherwise oldest to newest.</p>' : '') + grid(E, gopt) + '</section>';
    if (F.length) o += '<section class="sect sect-movies" aria-labelledby="sf-h"><div class="rail-head"><h2 id="sf-h"><span>Movies &amp; Specials</span> <small>' + F.length + '</small></h2><button type="button" class="see" data-l="' + reg(F) + '" data-i="0">▶ Play all</button></div>' + grid(F, gopt) + '</section>';
    if (M.length) o += '<section class="sect" aria-labelledby="sm-h"><div class="rail-head"><h2 id="sm-h"><span>' + (ordd ? 'Full Episode Marathons' : 'Marathons') + '</span> <small>' + M.length + '</small></h2><button type="button" class="see" data-l="' + reg(M) + '" data-i="0">▶ Play all</button></div>' + grid(M, gopt) + '</section>';
    return o;
  }
  function allHTML(key, kind) {
    const h = store.hubs[key]; const list = kind === 'M' ? h.M : kind === 'F' ? (h.F || []) : h.E;
    return '<section class="sect sect-top"><a class="crumb" href="#' + key + '">‹ ' + esc(HUBS[key].name) + '</a><div class="rail-head"><h1><span>' + kindTitle(kind) + '</span> <small>' + fmtNum(list.length) + '</small></h1>' +
      (list.length ? '<button type="button" class="see" data-l="' + reg(list) + '" data-i="0">▶ Play all</button>' : '') + '</div>' +
      (list.length ? grid(list) : '<div class="empty"><p>Nothing here yet. Check back soon.</p></div>') + '</section>';
  }
  function myListHTML() {
    const l = getList();
    return '<section class="sect sect-top"><div class="rail-head"><h1><span>My List</span> <small>' + l.length + '</small></h1></div>' +
      (l.length ? grid(l, { net: true }) : '<div class="empty"><div class="empty-ico" aria-hidden="true">+</div><h2>Your list is empty</h2><p>Tap the + on any episode or marathon to save it here.</p><a class="btn" href="#home">Browse cartoons</a></div>') + '</section>';
  }

  /* ---------- search ---------- */
  let sFilter = 'all';
  function searchShellHTML(q) {
    return '<section class="sect sect-top search"><h1 class="vh">Search</h1><form class="sbox" role="search" id="sform"><label class="vh" for="q">Search shows and episodes</label>' +
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>' +
      '<input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Search SpongeBob, Bluey, Ben 10…" value="' + esc(q || '') + '"></form>' +
      '<div class="chips" id="schips" role="group" aria-label="Filter by network"></div><div id="sres" aria-live="polite"><div class="empty"><p>Loading the whole lineup…</p></div></div></section>';
  }
  function runSearch() {
    const inp = $('#q'); if (!inp) return;
    const q = inp.value.trim().toLowerCase();
    const res = $('#sres'), chips = $('#schips');
    store.lists = [];
    if (!q) {
      chips.innerHTML = '';
      const pop = [];
      ORDER.forEach((k) => (store.hubs[k] ? store.hubs[k].shows.filter((s) => !isMore(s.s)).slice(0, 3) : []).forEach((s) => pop.push([k, s])));
      res.innerHTML = '<div class="rail-head"><h2><span>Popular shows</span></h2></div><div class="show-grid">' + pop.map((p) => showTile(p[0], p[1])).join('') + '</div>';
      return;
    }
    const toks = q.split(/\s+/).filter(Boolean);
    const hits = []; const showHits = [];
    ORDER.forEach((k) => {
      const h = store.hubs[k]; if (!h) return;
      h.shows.forEach((s) => { const n = s.s.toLowerCase(); if (!isMore(s.s) && toks.every((t) => n.includes(t))) showHits.push([k, s]); });
      h.videos.forEach((v) => {
        const hay = (v.t + ' ' + v.show).toLowerCase();
        if (toks.every((t) => hay.includes(t))) hits.push(v);
      });
    });
    hits.sort((a, b) => {
      const as = a.show.toLowerCase().includes(q) ? 1 : 0, bs = b.show.toLowerCase().includes(q) ? 1 : 0;
      if (as !== bs) return bs - as;
      if (a.k !== b.k) return a.k === 'E' ? -1 : 1;
      return (b.date || '').localeCompare(a.date || '');
    });
    const counts = {}; hits.forEach((v) => (counts[v.hub] = (counts[v.hub] || 0) + 1));
    if (sFilter !== 'all' && !counts[sFilter]) sFilter = 'all';
    chips.innerHTML = '<button type="button" class="chip" data-sf="all" aria-pressed="' + (sFilter === 'all') + '">All <small>' + fmtNum(hits.length) + '</small></button>' +
      ORDER.filter((k) => counts[k]).map((k) => '<button type="button" class="chip chip-' + k + '" data-sf="' + k + '" aria-pressed="' + (sFilter === k) + '">' + esc(HUBS[k].name) + ' <small>' + fmtNum(counts[k]) + '</small></button>').join('');
    const list = sFilter === 'all' ? hits : hits.filter((v) => v.hub === sFilter);
    const sh = sFilter === 'all' ? showHits : showHits.filter((x) => x[0] === sFilter);
    let o = '';
    if (sh.length) o += '<div class="rail-head"><h2><span>Shows</span></h2></div><div class="show-grid">' + sh.slice(0, 8).map((p) => showTile(p[0], p[1])).join('') + '</div>';
    if (list.length) o += '<div class="rail-head"><h2><span>Episodes &amp; marathons</span> <small>' + fmtNum(list.length) + '</small></h2></div>' + grid(list, { net: true });
    else o += '<div class="empty"><h2>No matches</h2><p>Nothing for “' + esc(inp.value.trim()) + '”. Try a show name like PAW Patrol or Gravity Falls.</p></div>';
    res.innerHTML = o;
    $$('[data-add]', res).forEach(syncAddBtn);
  }

  function bindFallbacks(root) {
    $$('img[data-fb]', root).forEach((img) => {
      if (img.dataset.fbBound) return; img.dataset.fbBound = 1;
      const fb = () => { if (img.dataset.fb && img.src !== img.dataset.fb) { img.src = img.dataset.fb; img.classList.add('lb'); } };
      img.addEventListener('error', fb);
      img.addEventListener('load', () => { if (img.naturalWidth && img.naturalWidth <= 120) fb(); });
      if (img.complete && img.naturalWidth && img.naturalWidth <= 120) fb();
    });
  }

  /* ---------- hero carousel ---------- */
  let heroTimer = null, heroIdle = null;
  function stopHero() { clearInterval(heroTimer); clearTimeout(heroIdle); heroTimer = null; }
  function initHero() {
    const track = $('#hero-track'); if (!track) return;
    const dots = $$('#hero-dots .dot');
    const n = dots.length;
    const cur = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const paint = () => { const c = cur(); dots.forEach((d, i) => { d.setAttribute('aria-current', i === c ? 'true' : 'false'); }); };
    const go = (i) => { track.scrollTo({ left: ((i + n) % n) * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
    const start = () => { stopHero(); if (n > 1) heroTimer = setInterval(() => { if (!document.hidden && $('#player').hidden) go(cur() + 1); }, 6000); };
    let raf; track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }, { passive: true });
    const pause = () => { stopHero(); heroIdle = setTimeout(start, 9000); };
    track.addEventListener('pointerdown', pause, { passive: true });
    track.addEventListener('touchstart', pause, { passive: true });
    dots.forEach((d) => d.addEventListener('click', () => { pause(); go(+d.dataset.dot); }));
    paint(); start();
  }

  /* ---------- rails arrows ---------- */
  function updateArrows() {
    $$('.rail-wrap').forEach((w) => {
      const t = w.querySelector('.rail-track'); if (!t) return;
      const p = w.querySelector('.prev'), nx = w.querySelector('.next'); if (!p) return;
      const f = () => { p.disabled = t.scrollLeft < 8; nx.disabled = t.scrollLeft + t.clientWidth >= t.scrollWidth - 8; };
      if (!t.dataset.bound) { t.dataset.bound = 1; t.addEventListener('scroll', f, { passive: true }); }
      f();
    });
  }

  /* ---------- networks sheet ---------- */
  function openSheet() {
    loadIndex().then(() => {
      $('#sheet-list').innerHTML = '<a class="sheet-row sheet-live" href="#live"><span class="net-logo">' + liveBadge() + '</span><span class="sr-txt"><b>Live TV</b><small>Nickelodeon TV · Disney TV · Cartoon Network TV · PBS KIDS 24/7</small></span><span aria-hidden="true" class="sr-go">›</span></a>' + ORDER.map((k) => { const s = stats(k); return '<a class="sheet-row net-' + k + '" href="#' + k + '"><span class="net-logo"><img src="' + HUBS[k].logo + '" alt=""></span><span class="sr-txt"><b>' + esc(HUBS[k].name) + '</b><small>' + fmtNum(s.episodes) + ' episodes · ' + (s.movies ? fmtNum(s.movies) + ' movies' : fmtNum(s.marathons) + ' marathons') + '</small></span><span aria-hidden="true" class="sr-go">›</span></a>'; }).join('');
    });
    const sh = $('#sheet'); sh.hidden = false; requestAnimationFrame(() => sh.classList.add('on'));
    document.body.classList.add('noscroll');
    setTimeout(() => { const c = $('#sheet .icon-btn'); c && c.focus(); }, 50);
  }
  function closeSheet() { const sh = $('#sheet'); if (sh.hidden) return; sh.classList.remove('on'); document.body.classList.remove('noscroll'); setTimeout(() => (sh.hidden = true), 220); }

  /* ---------- player ---------- */
  const P = { q: [], i: 0, v: null, yt: null, timer: null, fallback: false, lastFocus: null };
  let ytPromise = null;
  function loadYT() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (!ytPromise) {
      ytPromise = new Promise((res, rej) => {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch (e) { /* */ } res(); };
        const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
        s.onerror = () => { ytPromise = null; rej(new Error('yt api')); };
        document.head.appendChild(s);
        setTimeout(() => rej(new Error('yt timeout')), 6000);
      });
    }
    return ytPromise;
  }
  function openPlayer(list, i) {
    if (!list || !list[i]) return;
    P.q = list.slice(); P.i = i; P.lastFocus = document.activeElement;
    const el = $('#player'); el.hidden = false; requestAnimationFrame(() => el.classList.add('on'));
    document.body.classList.add('noscroll');
    playCurrent();
    clearInterval(P.timer);
    P.timer = setInterval(saveProgress, 10000);
    setTimeout(() => $('#p-close').focus({ preventScroll: true }), 30);
  }
  function saveProgress() {
    if (!P.v || !P.yt || typeof P.yt.getCurrentTime !== 'function') return;
    try { const t = P.yt.getCurrentTime(); if (t > 0) saveCW(P.v, t); } catch (e) { /* */ }
  }
  function frameSrc(id, start) {
    return 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1' + (start ? '&start=' + start : '') + '&origin=' + encodeURIComponent(location.origin);
  }
  function playCurrent() {
    const v = P.q[P.i]; if (!v) return; P.v = v;
    const pos = cwPos(v.id); const start = pos > 10 && (!v.d || pos < v.d - 30) ? pos : 0;
    paintPlayerInfo(v, start);
    const frame = $('#p-frame');
    if (P.yt && typeof P.yt.loadVideoById === 'function') { try { P.yt.loadVideoById({ videoId: v.id, startSeconds: start }); return; } catch (e) { /* recreate */ } }
    if (P.fallback || !(window.YT && window.YT.Player)) {
      // Show the privacy-enhanced iframe immediately; upgrade to the API player when it loads.
      frame.innerHTML = '<iframe id="p-if" src="' + frameSrc(v.id, start) + '" title="' + esc(v.ct) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      if (!P.fallback) {
        const want = v.id;
        loadYT().then(() => {
          if (!P.v || P.v.id !== want || $('#player').hidden) return;
          try {
            P.yt = new YT.Player('p-if', { events: { onStateChange: onYTState, onError: onYTError, onReady: (e) => { try { e.target.playVideo(); } catch (x) { /* */ } } } });
          } catch (e) { P.fallback = true; }
        }).catch(() => { P.fallback = true; });
      }
      return;
    }
    frame.innerHTML = '<div id="p-yt"></div>';
    P.yt = new YT.Player('p-yt', {
      host: 'https://www.youtube-nocookie.com', videoId: v.id, width: '100%', height: '100%',
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, start: start, origin: location.origin },
      events: { onReady: (e) => { try { e.target.playVideo(); } catch (x) { /* */ } }, onStateChange: onYTState, onError: onYTError }
    });
  }
  let skipRun = 0, skipT;
  function onYTError(e) {
    // 100 = removed/private, 101/150 = embedding disabled by owner
    if (![100, 101, 150].includes(e && e.data)) return;
    if (P.i + 1 < P.q.length && skipRun < 3) {
      skipRun++; toast('That one can\u2019t play here. Skipping ahead…');
      clearTimeout(skipT); const at = P.i;
      skipT = setTimeout(() => { if (!$('#player').hidden && P.i === at) { P.i++; playCurrent(); } }, 1800);
    } else toast('This video isn\u2019t available to play here.');
  }
  function onYTState(e) {
    if (window.YT && e.data === YT.PlayerState.PLAYING) skipRun = 0;
    if (!window.YT) return;
    if (e.data === YT.PlayerState.ENDED) {
      if (P.v) saveCW(P.v, (P.v.d || 1e9));
      if (P.i + 1 < P.q.length) { P.i++; toast('Up next: ' + P.q[P.i].ct); playCurrent(); }
    } else if (e.data === YT.PlayerState.PAUSED) saveProgress();
  }
  function paintPlayerInfo(v, start) {
    $('#p-net').innerHTML = netBadge(v.hub) + '<span class="p-kind k' + v.k + '">' + kindLabel(v.k) + '</span>';
    $('#p-title').textContent = v.ct;
    $('#p-title').title = v.t;
    $('#p-meta').innerHTML = [isMore(v.show) ? '' : '<a href="#' + v.hub + '/show/' + encodeURIComponent(v.show) + '" data-pclose>' + esc(v.show) + '</a>', esc(fmtDur(v.d)), esc(fmtDate(v.date)), start ? 'Resuming at ' + Math.floor(start / 60) + ':' + String(start % 60).padStart(2, '0') : ''].filter(Boolean).join('<span aria-hidden="true"> · </span>');
    syncPlayerAdd();
    const up = P.q.slice(P.i + 1, P.i + 13);
    $('#p-uphead').hidden = !up.length;
    $('#p-next').hidden = !up.length;
    $('#p-up').innerHTML = up.map((u, j) => '<li><button type="button" data-pjump="' + (P.i + 1 + j) + '" aria-label="Play ' + esc(u.ct) + '"><span class="thumb"><img src="' + thumb(u.id) + '" alt="" loading="lazy" width="160" height="90"><span class="dur">' + fmtDur(u.d) + '</span></span><span class="up-t"><b>' + esc(u.ct) + '</b><small>' + esc([isMore(u.show) ? HUBS[u.hub].name : u.show, kindLabel(u.k)].join(' · ')) + '</small></span></button></li>').join('');
    $('#player').dataset.hub = v.hub;
  }
  function syncPlayerAdd() {
    const b = $('#p-add'); if (!P.v) return; const on = inList(P.v.id);
    b.innerHTML = '<i aria-hidden="true">' + (on ? '✓' : '+') + '</i> ' + (on ? 'In My List' : 'My List');
    b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', (on ? 'Remove from' : 'Add to') + ' My List');
  }
  function closePlayer() {
    const el = $('#player'); if (el.hidden) return;
    saveProgress(); clearInterval(P.timer);
    try { if (P.yt && P.yt.destroy) P.yt.destroy(); } catch (e) { /* */ }
    P.yt = null; $('#p-frame').innerHTML = '';
    el.classList.remove('on'); el.hidden = true;
    document.body.classList.remove('noscroll');
    P.v = null;
    // refresh CW rows on current page
    if (route.name === 'home' || route.name === 'hub') {
      const old = $('.rail-cw'); const html = cwRail(route.name === 'hub' ? route.hub : null);
      if (old) { if (html) old.outerHTML = html; else old.remove(); }
      else if (html) { const anchor = route.name === 'home' ? $('.home-tag') : $('.subtabs'); if (anchor) anchor.insertAdjacentHTML('afterend', html); }
    }
    if (P.lastFocus && document.contains(P.lastFocus)) try { P.lastFocus.focus({ preventScroll: true }); } catch (e) { /* */ }
  }

  /* ---------- live TV: deterministic 24/7 channels on Eastern time ---------- */
  const TZ = 'America/New_York';
  const LIVE_ORDER = ['nick', 'disney', 'cn', 'pbskids'];
  const LIVE = {
    nick: { name: 'Nickelodeon TV', short: 'Nick TV', theme: 'nick', logo: HUBS.nick.logo, hubs: ['nick', 'nickjr', 'nickrewind'],
      blocks: [{ h: 0, pool: ['nick', 'nickrewind'], label: 'Nickelodeon TV' }, { h: 6, pool: ['nickjr'], label: 'Nick Jr. on Nickelodeon TV', jr: 'nickjr' }, { h: 11, pool: ['nick'], label: 'Nickelodeon TV' }] },
    disney: { name: 'Disney TV', short: 'Disney TV', theme: 'disney', logo: HUBS.disney.logo, hubs: ['disney', 'disneyjr'],
      blocks: [{ h: 0, pool: ['disney'], label: 'Disney TV' }, { h: 6, pool: ['disneyjr'], label: 'Disney Jr. Mornings', jr: 'disneyjr' }, { h: 11, pool: ['disney'], label: 'Disney TV' }] },
    cn: { name: 'Cartoon Network TV', short: 'CN TV', theme: 'cn', logo: HUBS.cn.logo, hubs: ['cn'],
      blocks: [{ h: 0, pool: ['cn'], label: 'Cartoon Network TV' }] },
    pbskids: { name: 'PBS KIDS 24/7', short: 'PBS KIDS', theme: 'pbskids', logo: HUBS.pbskids.logo, hubs: ['pbskids'],
      blocks: [{ h: 0, pool: ['pbskids'], label: 'PBS KIDS 24/7' }] }
  };
  const MIN_D = 120, MAX_D = 3 * 3600 + 300;
  const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function etParts(ms) { const o = {}; etFmt.formatToParts(new Date(ms)).forEach((p) => (o[p.type] = p.value)); return { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second }; }
  function etOffset(ms) { const p = etParts(ms); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; }
  function etTime(y, m, d, h) { const g = Date.UTC(y, m - 1, d, h); let t = g - etOffset(g); t = g - etOffset(t); return t; } // epoch ms of ET wall clock y-m-d h:00
  function etDayKey(ms) { const p = etParts(ms); return p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0'); }
  function dayAdd(key, n) { const a = key.split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2] + n)).toISOString().slice(0, 10); }
  function seedOf(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function mulberry(a) { return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function livePool(keys) {
    const out = [];
    keys.forEach((k) => { const h = store.hubs[k]; if (h && !h.error) h.videos.forEach((v) => { if (v.d >= MIN_D && v.d <= MAX_D) out.push(v); }); });
    return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  const schedCache = new Map();
  function liveDay(ch, key) {
    const ck = ch + '|' + key; if (schedCache.has(ck)) return schedCache.get(ck);
    const cfg = LIVE[ch]; const a = key.split('-').map(Number); const nx = dayAdd(key, 1).split('-').map(Number);
    const rnd = mulberry(seedOf('dtn-live|' + ch + '|' + key));
    const bounds = cfg.blocks.map((b) => etTime(a[0], a[1], a[2], b.h)).concat([etTime(nx[0], nx[1], nx[2], 0)]);
    const used = new Set(); const items = [];
    cfg.blocks.forEach((b, bi) => {
      const start = bounds[bi], end = bounds[bi + 1];
      const pool = livePool(b.pool);
      if (!pool.length) return;
      let cand = shuffle(pool.filter((v) => v.k === 'E'), rnd).concat(shuffle(pool.filter((v) => v.k !== 'E'), rnd));
      let ci = 0, t = start, guard = 0;
      while (t < end && guard++ < 5000) {
        let v = null;
        while (ci < cand.length) { const c = cand[ci++]; if (!used.has(c.id)) { v = c; break; } }
        if (!v) { // pool exhausted for today: allow repeats, keep E-first order
          cand.forEach((c) => used.delete(c.id)); ci = 0;
          cand = shuffle(pool.filter((x) => x.k === 'E'), rnd).concat(shuffle(pool.filter((x) => x.k !== 'E'), rnd));
          if (items.length && cand.length > 1 && cand[0].id === items[items.length - 1].v.id) cand.push(cand.shift());
          continue;
        }
        used.add(v.id);
        const e = Math.min(end, t + v.d * 1000);
        items.push({ ch, v, s: t, e, b: bi, cut: e < t + v.d * 1000 });
        t = e;
      }
    });
    schedCache.set(ck, items);
    return items;
  }
  function liveAt(ch, t) { const it = liveDay(ch, etDayKey(t)); for (let i = 0; i < it.length; i++) if (it[i].s <= t && t < it[i].e) return it[i]; return null; }
  function liveNext(ch, t, n) {
    const key = etDayKey(t); let out = liveDay(ch, key).filter((x) => x.e > t);
    if (out.length < n) out = out.concat(liveDay(ch, dayAdd(key, 1)));
    return out.slice(0, n);
  }
  const liveHubsReady = (ch) => Promise.all(LIVE[ch].hubs.map(loadHub));
  const blockLabel = (it) => (it ? LIVE[it.ch].blocks[it.b].label : '');
  const isJr = (it) => !!(it && LIVE[it.ch].blocks[it.b].jr);
  const tShort = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });
  const tZone = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const tET = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const sameAsET = () => etOffset(Date.now()) === -new Date().getTimezoneOffset() * 60000;
  const showName = (v) => (isMore(v.show) ? HUBS[v.hub].name : v.show);
  const pct = (it, t) => Math.max(0, Math.min(100, ((t - it.s) / Math.max(1, it.e - it.s)) * 100));
  function minsLeft(it, t) { const m = Math.max(1, Math.round((it.e - t) / 60000)); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm left' : m + ' min left'; }
  const liveBadge = () => '<span class="live-badge"><i aria-hidden="true"></i>LIVE</span>';

  function liveCard(ch, t) {
    const cfg = LIVE[ch]; const it = liveAt(ch, t); const nx = it ? liveNext(ch, it.e, 1)[0] : null;
    const lbl = it ? 'Watch ' + cfg.name + ' live: ' + it.v.ct : 'Watch ' + cfg.name;
    return '<a class="live-card lc-' + ch + (isJr(it) ? ' lc-jr' : '') + '" href="#live/' + ch + '" data-live="' + ch + '" aria-label="' + esc(lbl) + '">' +
      '<span class="thumb lc-thumb">' + (it ? '<img src="' + thumb(it.v.id) + '" alt="" loading="lazy" decoding="async" width="320" height="180">' : '') + liveBadge() +
      '<span class="lc-logo"><img src="' + (isJr(it) ? HUBS[LIVE[ch].blocks[it.b].jr].logo : cfg.logo) + '" alt=""></span></span>' +
      '<span class="lc-body"><span class="lc-ch">' + esc(it ? blockLabel(it) : cfg.name) + '</span>' +
      '<span class="lc-title">' + esc(it ? it.v.ct : 'Off air') + '</span>' +
      (it ? '<span class="lc-meta">' + esc(showName(it.v)) + ' · <span class="lc-left">' + minsLeft(it, t) + '</span></span>' : '') +
      '<span class="lprog"><b style="width:' + (it ? pct(it, t).toFixed(1) : 0) + '%"></b></span>' +
      (nx ? '<span class="lc-next">Next ' + esc(tShort.format(nx.s)) + ': ' + esc(nx.v.ct) + '</span>' : '') + '</span></a>';
  }
  function liveRailHTML() {
    const t = Date.now();
    return '<section class="live-rail" id="live-rail" aria-labelledby="lr-h"><div class="rail-head"><h2 id="lr-h">' + liveBadge() + '<span>Live now</span></h2><a class="see" href="#live">Full guide<span aria-hidden="true"> ›</span></a></div>' +
      '<div class="live-track">' + LIVE_ORDER.map((ch) => liveCard(ch, t)).join('') + '</div></section>';
  }
  function liveGuideHTML() {
    const t = Date.now(); const zone = tZone.formatToParts(t).find((p) => p.type === 'timeZoneName');
    let o = '<section class="sect sect-top live-guide"><div class="rail-head"><h1>' + liveBadge() + '<span>Live TV</span></h1></div>' +
      '<p class="lg-sub">Four channels, 24/7. Everyone watches the same thing at the same time. Times shown in your time zone' + (zone ? ' (' + esc(zone.value) + ')' : '') + '; mornings 6–11 AM Eastern are for little ones.</p>';
    LIVE_ORDER.forEach((ch) => {
      const cfg = LIVE[ch]; const list = liveNext(ch, t, 7);
      o += '<section class="lg-row lg-' + ch + '" aria-label="' + esc(cfg.name) + '"><div class="lg-head"><span class="lg-logo"><img src="' + cfg.logo + '" alt=""></span><h2>' + esc(cfg.name) + '</h2><a class="btn lg-watch" href="#live/' + ch + '"><i aria-hidden="true">▶</i> Watch live</a></div>' +
        '<div class="lg-body">' + liveCard(ch, t) + '<ol class="lg-list">' + list.slice(1).map((it) => guideRow(it, t)).join('') + '</ol></div></section>';
    });
    return o + '</section>';
  }
  function guideRow(it, t) {
    const now = it.s <= t && t < it.e; const et = !sameAsET();
    return '<li class="gr' + (now ? ' gr-now' : '') + (isJr(it) ? ' gr-jr' : '') + '"><span class="gr-time"><b>' + esc(tShort.format(it.s)) + '</b>' + (et ? '<small>' + esc(tET.format(it.s)) + '</small>' : '') + '</span>' +
      '<span class="gr-txt"><b>' + esc(it.v.ct) + '</b><small>' + esc([showName(it.v), it.cut ? fmtDur((it.e - it.s) / 1000) + ' (cut)' : fmtDur(it.v.d), isJr(it) ? blockLabel(it) : ''].filter(Boolean).join(' · ')) + '</small></span>' +
      (now ? liveBadge() : '') + '</li>';
  }
  function liveChannelHTML(ch) {
    const cfg = LIVE[ch]; const i = LIVE_ORDER.indexOf(ch);
    const up = LIVE_ORDER[(i + 1) % LIVE_ORDER.length], dn = LIVE_ORDER[(i + LIVE_ORDER.length - 1) % LIVE_ORDER.length];
    return '<section class="live-ch lv-' + ch + '"><div class="lv-main">' +
      '<div class="lv-stage" id="lv-stage"><div class="lv-frame" id="lv-frame"></div>' +
      '<div class="lv-bug" aria-hidden="true">' + liveBadge() + '<span id="lv-bug-t">' + esc(cfg.name) + '</span></div>' +
      '<div class="lv-slate" id="lv-slate" hidden><div><span class="lv-slate-logo"><img src="' + cfg.logo + '" alt=""></span><p id="lv-slate-t"></p></div></div></div>' +
      '<div class="lv-info"><div class="lv-now"><p class="lv-block">' + liveBadge() + '<span id="lv-block">' + esc(cfg.name) + '</span></p>' +
      '<h1 class="lv-title" id="lv-title">Tuning in…</h1><p class="lv-meta" id="lv-meta"></p><span class="lprog lv-prog"><b id="lv-prog"></b></span>' +
      '<p class="lv-next" id="lv-next"></p></div>' +
      '<div class="lv-ctl" role="group" aria-label="Channel controls">' +
      '<button type="button" class="btn btn-ghost lv-chbtn" data-chan="' + dn + '" aria-label="Channel down: ' + esc(LIVE[dn].name) + '"><i aria-hidden="true">▼</i> CH <small>' + esc(LIVE[dn].short) + '</small></button>' +
      '<button type="button" class="btn btn-ghost lv-chbtn" data-chan="' + up + '" aria-label="Channel up: ' + esc(LIVE[up].name) + '"><i aria-hidden="true">▲</i> CH <small>' + esc(LIVE[up].short) + '</small></button>' +
      '<a class="btn btn-ghost" href="#live">Guide</a></div></div></div>' +
      '<section class="lv-guide" aria-labelledby="lvg-h"><h2 id="lvg-h">On ' + esc(cfg.name) + '</h2><ol class="lg-list" id="lv-guide"></ol></section></section>';
  }

  /* live player engine */
  const L = { ch: null, item: null, vid: null, filler: false, yt: null, ytReady: false, tick: null, skips: 0, bad: new Set(), waitUntil: 0, lastPaint: 0, homeTick: null, iframe: false };
  function stopLive() {
    clearInterval(L.tick); clearInterval(L.homeTick); L.tick = L.homeTick = null;
    try { if (L.yt && L.yt.destroy) L.yt.destroy(); } catch (e) { /* */ }
    L.yt = null; L.ytReady = false; L.ch = null; L.item = null; L.vid = null; L.filler = false; L.iframe = false;
  }
  function startHomeLive() {
    clearInterval(L.homeTick);
    L.homeTick = setInterval(() => {
      if (document.hidden) return;
      const r = $('#live-rail'); if (!r) return;
      const t = Date.now(); const tr = r.querySelector('.live-track'); const sl = tr.scrollLeft;
      const f = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.live : null;
      tr.innerHTML = LIVE_ORDER.map((ch) => liveCard(ch, t)).join(''); tr.scrollLeft = sl;
      if (f) { const el = tr.querySelector('[data-live="' + f + '"]'); if (el) { el.focus({ preventScroll: true }); if (window.__tvnav) window.__tvnav.focus(el, false); } }
    }, 30000);
  }
  function tuneLive(ch) {
    L.ch = ch; L.skips = 0; L.waitUntil = 0;
    syncLive(true);
    clearInterval(L.tick); L.tick = setInterval(() => syncLive(false), 1000);
  }
  function liveFrameSrc(id, start) { return 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&start=' + Math.floor(start) + '&origin=' + encodeURIComponent(location.origin); }
  function liveLoad(v, start) {
    L.vid = v.id; start = Math.max(0, Math.floor(start));
    if (L.yt && L.ytReady && typeof L.yt.loadVideoById === 'function') { try { L.yt.loadVideoById({ videoId: v.id, startSeconds: start }); return; } catch (e) { /* recreate */ } }
    const fr = $('#lv-frame'); if (!fr) return;
    if (window.YT && window.YT.Player && !L.iframe) {
      fr.innerHTML = '<div id="lv-yt"></div>'; L.ytReady = false;
      L.yt = new YT.Player('lv-yt', { host: 'https://www.youtube-nocookie.com', videoId: v.id, width: '100%', height: '100%',
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, start: start, origin: location.origin },
        events: { onReady: (e) => { L.ytReady = true; try { e.target.playVideo(); } catch (x) { /* */ } }, onStateChange: onLiveState, onError: onLiveError } });
      return;
    }
    // API not available (yet): plain embed; the 1s clock still advances the schedule.
    fr.innerHTML = '<iframe id="lv-if" src="' + liveFrameSrc(v.id, start) + '" title="' + esc(v.ct) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    if (!L.iframe) {
      const want = L.ch;
      loadYT().then(() => {
        if (L.ch !== want || !$('#lv-if')) return;
        try { L.yt = new YT.Player('lv-if', { events: { onReady: () => { L.ytReady = true; }, onStateChange: onLiveState, onError: onLiveError } }); } catch (e) { L.iframe = true; }
      }).catch(() => { L.iframe = true; });
    }
  }
  function slate(msg) { const s = $('#lv-slate'); if (!s) return; if (msg) { $('#lv-slate-t').textContent = msg; s.hidden = false; } else s.hidden = true; }
  function syncLive(force) {
    if (!L.ch || !$('#lv-frame')) return;
    const t = Date.now();
    if (L.waitUntil && t < L.waitUntil) { paintLive(t); return; }
    const it = liveAt(L.ch, t);
    if (!it) { slate('Off air right now. Check back soon.'); paintLive(t); return; }
    if (force || !L.item || it.s !== L.item.s || L.waitUntil) {
      const fresh = !L.item || it.s !== L.item.s;
      L.item = it; L.waitUntil = 0;
      if (fresh) L.skips = 0;
      const off = (t - it.s) / 1000;
      if (L.bad.has(it.v.id)) { playFiller(it); }
      else if (L.vid === it.v.id && L.yt && L.ytReady && !force) { L.filler = false; slate(null); try { L.yt.seekTo(off, true); L.yt.playVideo(); } catch (e) { /* */ } }
      else { L.filler = false; slate(null); liveLoad(it.v, off); }
      paintLive(t, true);
      return;
    }
    if (t - L.lastPaint > 900) paintLive(t);
  }
  function playFiller(it) {
    // The scheduled program can't play here: run the following programs from their start until the clock catches up.
    const cands = liveNext(L.ch, it.e, 12).filter((x) => !L.bad.has(x.v.id) && x.v.id !== L.vid);
    const f = cands[0];
    if (!f || L.skips > 3) { giveUp(); return; }
    L.filler = true; slate(null); liveLoad(f.v, 0);
  }
  function giveUp() {
    const it = L.item; L.waitUntil = it ? it.e : Date.now() + 60000;
    try { if (L.yt && L.yt.stopVideo) L.yt.stopVideo(); } catch (e) { /* */ }
    slate('We\u2019re having trouble playing this channel here. We\u2019ll try again at ' + tShort.format(L.waitUntil) + '.');
  }
  function onLiveError(e) {
    if (!L.ch) return;
    if (L.vid) L.bad.add(L.vid);
    L.skips++;
    if (L.skips > 3) { giveUp(); return; }
    toast('That one can\u2019t play here. Skipping ahead…');
    playFiller(L.item || liveAt(L.ch, Date.now()));
  }
  function onLiveState(e) {
    if (!window.YT || !L.ch) return;
    const t = Date.now();
    if (e.data === YT.PlayerState.PLAYING) {
      L.skips = 0; slate(null);
      if (!L.filler && L.item && L.vid === L.item.v.id) {
        const want = (t - L.item.s) / 1000;
        try { const cur = L.yt.getCurrentTime(); if (Math.abs(cur - want) > 6 && want < L.item.v.d - 5) L.yt.seekTo(want, true); } catch (x) { /* */ }
      }
    } else if (e.data === YT.PlayerState.ENDED) {
      if (L.filler) { const it = liveNext(L.ch, t, 12).find((x) => x.v.id !== L.vid && !L.bad.has(x.v.id) && x.s > (L.item ? L.item.s : 0)); if (it && L.item && t < L.item.e - 2000) { liveLoad(it.v, 0); return; } }
      if (L.item && t < L.item.e - 2000) { const n = liveNext(L.ch, L.item.e, 1)[0]; slate(n ? 'Up next at ' + tShort.format(n.s) + ': ' + n.v.ct : 'Up next…'); }
    }
  }
  function paintLive(t, full) {
    L.lastPaint = t; const it = L.item; if (!it || !$('#lv-title')) return;
    const cfg = LIVE[L.ch];
    $('#lv-prog').style.width = pct(it, t).toFixed(2) + '%';
    if (!full) { const m = $('#lv-left'); if (m) m.textContent = minsLeft(it, t); return; }
    const lbl = blockLabel(it);
    $('#lv-block').textContent = lbl; $('#lv-bug-t').textContent = lbl;
    $('#lv-title').textContent = it.v.ct; $('#lv-title').title = it.v.t;
    const et = !sameAsET();
    $('#lv-meta').innerHTML = esc(showName(it.v)) + ' · ' + esc(tShort.format(it.s)) + '–' + esc(tZone.format(it.e)) + (et ? ' <small>(' + esc(tET.format(it.s)) + ')</small>' : '') + ' · <span id="lv-left">' + minsLeft(it, t) + '</span>';
    const nx = liveNext(L.ch, it.e, 1)[0];
    $('#lv-next').innerHTML = nx ? '<b>Next</b> ' + esc(tShort.format(nx.s)) + ' · ' + esc(nx.v.ct) + (isJr(nx) !== isJr(it) ? ' <small>(' + esc(blockLabel(nx)) + ')</small>' : '') : '';
    $('#lv-guide').innerHTML = liveNext(L.ch, t, 9).map((x) => guideRow(x, t)).join('');
    const st = $('.live-ch'); if (st) st.classList.toggle('is-jr', isJr(it));
    document.title = lbl + ' · Live · Dis-Toon-elodeon';
    void cfg;
  }
  const tvSize = () => window.matchMedia('(min-width: 880px) and (max-height: 620px)').matches;
  async function renderLiveChannel(ch, seq) {
    await liveHubsReady(ch); if (seq !== renderSeq) return false;
    $('#app').innerHTML = liveChannelHTML(ch);
    document.body.classList.add('page-live');
    if (tvSize()) { const s = $('#lv-stage'); if (s) window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY); }
    try { await loadYT(); } catch (e) { L.iframe = true; }
    if (seq !== renderSeq) return false;
    tuneLive(ch);
    return true;
  }
  function chanKey(e) {
    if (route.name !== 'live' || !route.ch) return;
    const k = e.key;
    if (k === 'ChannelUp' || k === 'PageUp' || k === 'ChannelDown' || k === 'PageDown') {
      const i = LIVE_ORDER.indexOf(route.ch); const d = (k === 'ChannelUp' || k === 'PageUp') ? 1 : -1;
      e.preventDefault(); location.hash = '#live/' + LIVE_ORDER[(i + d + LIVE_ORDER.length) % LIVE_ORDER.length];
    }
  }
  function liveDrift() {
    if (!L.ch || !L.item || L.filler || !L.yt || !L.ytReady || L.vid !== L.item.v.id) return;
    try { const want = (Date.now() - L.item.s) / 1000; const cur = L.yt.getCurrentTime(); if (Math.abs(cur - want) > 6 && want < L.item.v.d - 5) L.yt.seekTo(want, true); } catch (e) { /* */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && L.ch) { syncLive(false); liveDrift(); } });
  document.addEventListener('keydown', chanKey);
  window.__dtnLive = { liveDay, liveAt, liveNext, etDayKey, etTime, LIVE, liveHubsReady, L, onLiveError, syncLive };

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-chan],[data-l],[data-add],[data-cwrm],[data-more],[data-scroll],[data-sheet],[data-sf],[data-pjump],[data-pclose],[data-jump],.sheet-row');
    if (!t) return;
    if (t.matches('.sheet-row')) { closeSheet(); return; }
    if (t.dataset.chan) { e.preventDefault(); const cur = t.dataset.chan; const i = LIVE_ORDER.indexOf(route.ch); const up = LIVE_ORDER[(i + 1) % LIVE_ORDER.length]; liveRefocus = cur === up ? LIVE_ORDER[(LIVE_ORDER.indexOf(cur) + 1) % LIVE_ORDER.length] : LIVE_ORDER[(LIVE_ORDER.indexOf(cur) + LIVE_ORDER.length - 1) % LIVE_ORDER.length]; location.hash = '#live/' + cur; return; }
    if (t.dataset.pclose !== undefined) { closePlayer(); return; }
    if (t.dataset.add) { e.preventDefault(); const v = videoIndex.get(t.dataset.add) || getList().find((x) => x.id === t.dataset.add); if (v) toggleList(v); return; }
    if (t.dataset.l !== undefined) { e.preventDefault(); openPlayer(store.lists[+t.dataset.l], +t.dataset.i || 0); return; }
    if (t.dataset.cwrm) { lsSet(LS_CW, getCW().filter((x) => x.id !== t.dataset.cwrm)); const c = t.closest('.card'); const r = t.closest('.rail-cw'); c && c.remove(); if (r && !r.querySelector('.card')) r.remove(); toast('Removed from Continue Watching'); return; }
    if (t.dataset.more) {
      const l = +t.dataset.more, shown = +t.dataset.shown; const list = store.lists[l]; const g = $('.grid[data-gl="' + l + '"]');
      const net = g && g.dataset.net === '1'; const inshow = g && g.dataset.inshow === '1';
      g.insertAdjacentHTML('beforeend', list.slice(shown, shown + PAGE).map((v, i) => card(v, l, shown + i, { net, inshow })).join(''));
      const w = t.closest('.more-wrap'); const nb = moreBtn(l, shown + PAGE); w.outerHTML = nb || '';
      return;
    }
    if (t.dataset.scroll) { const tr = t.parentElement.querySelector('.rail-track'); tr.scrollBy({ left: +t.dataset.scroll * tr.clientWidth * 0.9, behavior: 'smooth' }); return; }
    if (t.dataset.sheet) { e.preventDefault(); t.dataset.sheet === 'open' ? openSheet() : closeSheet(); return; }
    if (t.dataset.sf) { sFilter = t.dataset.sf; runSearch(); return; }
    if (t.dataset.pjump) { saveProgress(); P.i = +t.dataset.pjump; playCurrent(); $('.p-scroll').scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (t.dataset.jump) { e.preventDefault(); const s = document.getElementById(t.dataset.jump); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  });
  $('#p-close').addEventListener('click', closePlayer);
  $('#p-add').addEventListener('click', () => P.v && toggleList(P.v));
  $('#p-next').addEventListener('click', () => { if (P.i + 1 < P.q.length) { saveProgress(); P.i++; playCurrent(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('#player').hidden) closePlayer(); else closeSheet(); }
  });
  let sDeb;
  document.addEventListener('input', (e) => { if (e.target.id === 'q') { clearTimeout(sDeb); sDeb = setTimeout(runSearch, 140); } });
  document.addEventListener('submit', (e) => { if (e.target.id === 'sform') { e.preventDefault(); runSearch(); const i = $('#q'); i && i.blur(); } });
  window.addEventListener('hashchange', () => { closeSheet(); closePlayer(); render(); });
  window.addEventListener('pagehide', saveProgress);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(updateArrows, 150); });

  render();
})();
