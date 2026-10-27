// Copyright 2026 hatim
// SPDX-License-Identifier: Apache-2.0

/* 共享前端运行时 */
(function () {
  const ICONS = {
    mic: '<path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/>',
    monitor: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    upload: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    chart: '<path d="M4 20V10m5 10V4m5 16v-7m5 7V8"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.11a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.11a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49 1Z"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3h-3z"/>',
    play: '<path d="M7 4.5 19 12 7 19.5z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3"/><path d="M12 13v4M9 21h6M10 17h4"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 20a5.6 5.6 0 0 0-2-4.3"/>',
    check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 5v6h-6"/>',
    download: '<path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sparkles: '<path d="M12 3l1.8 4.9L19 9.7l-4.4 3.1L15.6 18 12 15.2 8.4 18l1-5.2L5 9.7l5.2-1.8z"/>',
    edit: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/>',
    trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
    arrow: '<path d="M5 12h14m0 0-5-5m5 5-5 5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 4.3 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    door: '<path d="M14 21V4a1 1 0 0 0-1.2-1L5 5v16"/><path d="M14 12h.01M3 21h18"/>',
  };

  const AVATAR_COLORS = ['#8c5a4a', '#4a6b6a', '#6a5a86', '#7a6a44', '#4d5f7a', '#86505c', '#5b6f52', '#6d5b4a'];

  const LK = {};
  LK.state = { pin: localStorage.getItem('lucky.pin') || '', boot: null, activityId: null };

  LK.icon = function (name, size) {
    const path = ICONS[name] || ICONS.info;
    return `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  };

  LK.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  LK.avatar = function (name, size) {
    const nm = String(name || '?');
    let hash = 0;
    for (let i = 0; i < nm.length; i++) hash = (hash * 31 + nm.charCodeAt(i)) >>> 0;
    const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
    const s = size || 30;
    return `<span class="avatar" style="background:${color};width:${s}px;height:${s}px;font-size:${Math.round(s * 0.4)}px">${LK.esc(nm.slice(0, 1))}</span>`;
  };

  LK.fmtTime = function (ts, withDate) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
    if (withDate) return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${hm}`;
    return hm;
  };

  LK.fmtFull = function (ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  LK.relTime = function (ts) {
    const diff = Date.now() - ts;
    if (diff < 45_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return LK.fmtTime(ts, true);
  };

  /* ------------------------------ API ------------------------------ */

  LK.api = async function (path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (LK.state.pin) headers['X-Admin-Pin'] = LK.state.pin;
    const res = await fetch(path, {
      ...options,
      headers,
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    });
    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = { error: text };
    }
    if (!res.ok) {
      const err = new Error(data.error || `请求失败 (${res.status})`);
      err.status = res.status;
      err.data = data;
      if (data.code === 'PIN_REQUIRED') {
        LK.state.pin = '';
        localStorage.removeItem('lucky.pin');
      }
      throw err;
    }
    return data;
  };

  LK.get = (path) => LK.api(path);
  LK.post = (path, body) => LK.api(path, { method: 'POST', body: body || {} });
  LK.patch = (path, body) => LK.api(path, { method: 'PATCH', body: body || {} });
  LK.del = (path) => LK.api(path, { method: 'DELETE' });

  LK.askPin = function () {
    return new Promise((resolve) => {
      const mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML = `
        <div class="modal" style="max-width:380px">
          <div class="modal-head"><h3>主持人台密码</h3><p>本场活动已开启操作密码保护</p></div>
          <div class="modal-body"><input class="input" id="pinInput" type="password" inputmode="numeric" maxlength="8" placeholder="请输入 4-8 位数字" autofocus></div>
          <div class="modal-foot"><button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-ok>进入</button></div>
        </div>`;
      document.body.appendChild(mask);
      const input = mask.querySelector('#pinInput');
      setTimeout(() => input.focus(), 50);
      const done = (val) => {
        mask.remove();
        resolve(val);
      };
      mask.querySelector('[data-ok]').onclick = () => {
        const v = input.value.trim();
        if (!v) return input.focus();
        LK.state.pin = v;
        localStorage.setItem('lucky.pin', v);
        done(true);
      };
      mask.querySelector('[data-cancel]').onclick = () => done(false);
      input.onkeydown = (e) => { if (e.key === 'Enter') mask.querySelector('[data-ok]').click(); };
    });
  };

  LK.withPin = async function (fn) {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 401 && err.data && err.data.code === 'PIN_REQUIRED') {
        const ok = await LK.askPin();
        if (!ok) throw err;
        return await fn();
      }
      throw err;
    }
  };

  /* ----------------------------- UI 组件 ----------------------------- */

  LK.toast = function (msg, type = '') {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 320);
    }, type === 'err' ? 3600 : 2400);
  };

  LK.confirm = function ({ title, desc, okText = '确认', cancelText = '取消', danger = false, extra = '' }) {
    return new Promise((resolve) => {
      const mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML = `
        <div class="modal" style="max-width:440px">
          <div class="modal-head"><h3>${LK.esc(title)}</h3>${desc ? `<p>${desc}</p>` : ''}</div>
          <div class="modal-body">${extra}</div>
          <div class="modal-foot">
            <button class="btn" data-cancel>${LK.esc(cancelText)}</button>
            <button class="btn ${danger ? 'btn-red' : 'btn-primary'}" data-ok>${LK.esc(okText)}</button>
          </div>
        </div>`;
      document.body.appendChild(mask);
      const close = (v) => { mask.remove(); resolve(v); };
      mask.querySelector('[data-ok]').onclick = () => close(true);
      mask.querySelector('[data-cancel]').onclick = () => close(false);
      mask.onclick = (e) => { if (e.target === mask) close(false); };
      setTimeout(() => mask.querySelector('[data-ok]').focus(), 60);
    });
  };

  LK.modal = function ({ title, desc, body, okText = '保存', cancelText = '取消', onOk, width = 520 }) {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal" style="max-width:${width}px">
        <div class="modal-head"><h3>${LK.esc(title)}</h3>${desc ? `<p>${desc}</p>` : ''}</div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">
          <button class="btn" data-cancel>${LK.esc(cancelText)}</button>
          <button class="btn btn-primary" data-ok>${LK.esc(okText)}</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    const close = () => mask.remove();
    mask.querySelector('[data-cancel]').onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
    mask.querySelector('[data-ok]').onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const keep = await onOk(mask, close);
        if (keep !== false) close();
      } catch (err) {
        LK.toast(err.message, 'err');
      } finally {
        btn.disabled = false;
      }
    };
    return { mask, close };
  };

  LK.copy = async function (text) {
    try {
      await navigator.clipboard.writeText(text);
      LK.toast('已复制', 'ok');
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      LK.toast('已复制', 'ok');
    }
  };

  /* ------------------------------ 外壳 ------------------------------ */

  const NAV = [
    { group: '现场执行' },
    { href: '/host', key: 'host', label: '主持人台', icon: 'mic' },
    { href: '/screen', key: 'screen', label: '现场大屏', icon: 'monitor', blank: true },
    { group: '活动配置' },
    { href: '/import', key: 'import', label: '名单与奖项', icon: 'upload' },
    { href: '/reports', key: 'reports', label: '历史报表', icon: 'chart' },
    { href: '/settings', key: 'settings', label: '系统设置', icon: 'gear' },
  ];

  LK.STATUS_TEXT = { draft: '筹备中', live: '进行中', closed: '已结束' };

  LK.mountShell = function ({ active, title, sub, actions = '' }) {
    const sidebar = document.getElementById('sidebar');
    const topbar = document.getElementById('topbar');
    const act = LK.state.boot && LK.state.boot.activities.find((a) => a.id === LK.state.activityId);
    const status = act ? act.status : 'draft';

    if (sidebar) {
      const key = `${active}:${LK.state.activityId}`;
      if (sidebar.dataset.key === key) {
        const sel = sidebar.querySelector('#actSelect');
        if (sel && act) sel.value = act.id;
      } else {
        sidebar.dataset.key = key;
        sidebar.innerHTML = `
          <div class="brand">
            <div class="brand-mark">幸</div>
            <div class="brand-text"><b>LUCKY</b><span>live draw</span></div>
          </div>
          <div class="act-switch" title="切换活动">
            <div class="act-switch-label">当前活动</div>
            <div class="act-switch-name"><span>${LK.esc(act ? act.name : '尚未创建活动')}</span></div>
            <select id="actSelect">
              ${LK.state.boot.activities.map((a) => `<option value="${a.id}" ${a.id === LK.state.activityId ? 'selected' : ''}>${LK.esc(a.name)}</option>`).join('')}
            </select>
          </div>
          <nav class="nav">
            ${NAV.map((n) => {
              if (n.group) return `<div class="nav-group">${n.group}</div>`;
              return `<a href="${n.href}" class="${n.key === active ? 'active' : ''}" ${n.blank ? 'target="_blank"' : ''}>${LK.icon(n.icon)}<span>${n.label}</span>${n.key === 'screen' && status === 'live' ? '<i class="dot"></i>' : ''}</a>`;
            }).join('')}
          </nav>
          <div class="sidebar-foot">
            <div class="row" style="gap:6px"><span class="chip live" style="background:rgba(255,255,255,.07);color:#cfcac1">${LK.STATUS_TEXT[status] || '—'}</span></div>
            <div style="margin-top:8px">活动码 <b style="color:#d8d4cb;letter-spacing:.1em">${LK.esc(act ? act.code : '—')}</b></div>
          </div>`;

        const sel = sidebar.querySelector('#actSelect');
        if (sel) {
          sel.onchange = async () => {
            await LK.post(`/api/activities/${sel.value}/current`);
            location.reload();
          };
        }
      }
    }

    if (topbar) {
      topbar.innerHTML = `
        <div>
          <h1>${LK.esc(title)}</h1>
          ${sub ? `<div class="sub">${sub}</div>` : ''}
        </div>
        <div class="topbar-actions">${actions}</div>`;
    }
  };

  LK.ready = async function ({ requireActivity = false } = {}) {
    let boot = await LK.get('/api/bootstrap');
    if (!boot.activities.length && requireActivity) {
      const created = await LK.createActivityFlow();
      if (created) boot = await LK.get('/api/bootstrap');
    }
    LK.state.boot = boot;
    const saved = localStorage.getItem('lucky.activityId');
    const fromUrl = new URLSearchParams(location.search).get('a');
    const exists = (id) => boot.activities.some((a) => a.id === id);
    if (fromUrl && exists(fromUrl)) LK.state.activityId = fromUrl;
    else if (boot.currentActivityId) LK.state.activityId = boot.currentActivityId;
    else if (saved && exists(saved)) LK.state.activityId = saved;
    else LK.state.activityId = boot.activities[0] ? boot.activities[0].id : null;
    if (LK.state.activityId) localStorage.setItem('lucky.activityId', LK.state.activityId);
    return boot;
  };

  LK.createActivityFlow = function () {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      const m = LK.modal({
        title: '创建活动',
        desc: '一个活动对应一场现场抽奖，名单与奖项相互独立',
        okText: '创建并开始',
        width: 460,
        body: `
          <div class="field">
            <label>活动名称</label>
            <input class="input" id="newActName" placeholder="例如：2026 新春年会 · 幸运时刻" maxlength="40">
          </div>
          <div class="field" style="margin-top:14px">
            <label class="row" style="gap:8px"><input type="checkbox" id="newActAllowDup" style="accent-color:#b93a2c"> <span class="small">允许同一人重复中奖</span></label>
          </div>`,
        onOk: async (mask, close) => {
          const name = mask.querySelector('#newActName').value.trim();
          if (!name) {
            LK.toast('请填写活动名称', 'err');
            return false;
          }
          const res = await LK.post('/api/activities', {
            name,
            allowDuplicateWin: mask.querySelector('#newActAllowDup').checked,
          });
          localStorage.setItem('lucky.activityId', res.activity.id);
          close();
          done(res.activity);
        },
      });
      m.mask.querySelector('[data-cancel]').addEventListener('click', () => done(null), { once: true });
      m.mask.addEventListener('click', (e) => {
        if (e.target === m.mask) done(null);
      });
    });
  };

  /* ------------------------------ SSE ------------------------------ */

  LK.stream = function (activityId, onEvent) {
    let es = null;
    let retry = 0;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`/api/stream?activityId=${encodeURIComponent(activityId)}`);
      es.onmessage = (e) => {
        retry = 0;
        try {
          onEvent(JSON.parse(e.data));
        } catch (_) {}
      };
      es.onerror = () => {
        try { es.close(); } catch (_) {}
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        setTimeout(connect, 800 * retry);
      };
    };
    connect();
    return {
      close() {
        closed = true;
        try { es && es.close(); } catch (_) {}
      },
    };
  };

  /* ------------------------------ 二维码 ------------------------------ */

  LK.qrSvg = function (text, size) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
    } catch (err) {
      return `<div style="font-size:10px;color:#999;padding:6px;word-break:break-all">${LK.esc(text)}</div>`;
    }
  };

  LK.joinUrl = function (code) {
    return `${location.protocol}//${location.host}/join?c=${code}`;
  };

  LK.getActivity = function () {
    return LK.state.boot.activities.find((a) => a.id === LK.state.activityId);
  };

  window.LK = LK;
})();
