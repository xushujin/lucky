// Copyright 2026 hatim
// SPDX-License-Identifier: Apache-2.0

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { URL } = require('node:url');

const store = require('./lib/store');

const PORT = Number(process.env.PORT) || 7788;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/* ---------------------------- helpers ---------------------------- */

function json(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function fail(res, err) {
  if (err instanceof store.ApiError) {
    return json(res, err.status, { error: err.message, ...err.extra });
  }
  console.error('[api]', err);
  return json(res, 500, { error: '服务器开小差了，请稍后重试' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) {
        reject(new store.ApiError(413, '数据过大，请分批导入'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new store.ApiError(400, '请求格式错误'));
      }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

const verifyAttempts = new Map();
function checkRateLimit(req) {
  const ip = clientIp(req);
  const cur = verifyAttempts.get(ip);
  const ts = Date.now();
  if (!cur || ts > cur.resetAt) {
    verifyAttempts.set(ip, { count: 1, resetAt: ts + 60_000 });
    return true;
  }
  cur.count++;
  return cur.count <= 25;
}

function requireAdmin(req, url) {
  if (!store.getSettings().adminPinEnabled) return;
  const pin = req.headers['x-admin-pin'] || url.searchParams.get('pin');
  if (!store.checkPin(pin)) {
    const err = new store.ApiError(401, '需要主持人台密码');
    err.extra = { code: 'PIN_REQUIRED' };
    throw err;
  }
}

function networkAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

/* ----------------------------- static ----------------------------- */

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/host') rel = '/host.html';
  if (rel === '/screen') rel = '/screen.html';
  if (rel === '/join') rel = '/join.html';
  if (rel === '/import') rel = '/import.html';
  if (rel === '/reports') rel = '/reports.html';
  if (rel === '/claim') rel = '/claim.html';
  if (rel === '/settings') rel = '/settings.html';

  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[\/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<meta charset="utf-8"><body style="font-family:system-ui;padding:60px;text-align:center"><h1>404</h1><p>页面不存在</p><p><a href="/">返回首页</a></p>');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

/* ------------------------------ api ------------------------------ */

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  const method = req.method;

  if (pathname === '/api/health') return json(res, 200, { ok: true, ts: Date.now() });

  if (pathname === '/api/stream' && method === 'GET') {
    const activityId = searchParams.get('activityId') || store.getState().currentActivityId;
    if (!activityId) {
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    store.addClient(activityId, res);
    const timer = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (_) {
        /* ignore */
      }
    }, 20_000);
    req.on('close', () => {
      clearInterval(timer);
      store.removeClient(activityId, res);
    });
    return;
  }

  if (pathname === '/api/bootstrap' && method === 'GET') {
    const state = store.getState();
    const current = state.activities.find((a) => a.id === state.currentActivityId) || state.activities[0] || null;
    return json(res, 200, {
      activities: store.listActivities(),
      currentActivityId: current ? current.id : null,
      current: current ? store.screenSnapshot(current.id) : null,
      settings: store.getSettings(),
      addresses: networkAddresses(),
      port: PORT,
    });
  }

  if (pathname === '/api/activities' && method === 'GET') {
    return json(res, 200, { activities: store.listActivities(), currentActivityId: store.getState().currentActivityId });
  }

  if (pathname === '/api/activities' && method === 'POST') {
    requireAdmin(req, url);
    const body = await readBody(req);
    const activity = store.createActivity(body);
    return json(res, 201, { activity });
  }

  const actMatch = pathname.match(/^\/api\/activities\/([\w-]+)$/);
  if (actMatch && method === 'PATCH') {
    requireAdmin(req, url);
    const body = await readBody(req);
    return json(res, 200, { activity: store.updateActivity(actMatch[1], body) });
  }

  if (actMatch && method === 'DELETE') {
    requireAdmin(req, url);
    return json(res, 200, store.deleteActivity(actMatch[1]));
  }

  const currentMatch = pathname.match(/^\/api\/activities\/([\w-]+)\/current$/);
  if (currentMatch && method === 'POST') {
    const act = store.setCurrentActivity(currentMatch[1]);
    return json(res, 200, { activity: act });
  }

  const snapshotMatch = pathname.match(/^\/api\/activities\/([\w-]+)\/snapshot$/);
  if (snapshotMatch && method === 'GET') {
    return json(res, 200, store.activitySnapshot(snapshotMatch[1]));
  }

  const screenMatch = pathname.match(/^\/api\/screen\/([\w-]+)$/);
  if (screenMatch && method === 'GET') {
    return json(res, 200, store.screenSnapshot(screenMatch[1]));
  }

  if (pathname === '/api/participants/import' && method === 'POST') {
    requireAdmin(req, url);
    const body = await readBody(req);
    return json(res, 200, store.importParticipants(body.activityId, body.rows, body.mode));
  }

  const participantMatch = pathname.match(/^\/api\/participants\/([\w-]+)$/);
  if (participantMatch && method === 'PATCH') {
    requireAdmin(req, url);
    const body = await readBody(req);
    return json(res, 200, { participant: store.updateParticipant(body.activityId, participantMatch[1], body) });
  }
  if (participantMatch && method === 'DELETE') {
    requireAdmin(req, url);
    const activityId = searchParams.get('activityId') || store.getState().currentActivityId;
    return json(res, 200, store.deleteParticipant(activityId, participantMatch[1]));
  }

  const resetMatch = pathname.match(/^\/api\/participants\/([\w-]+)\/reset$/);
  if (resetMatch && method === 'POST') {
    requireAdmin(req, url);
    const body = await readBody(req);
    return json(res, 200, store.resetVerification(body.activityId, resetMatch[1]));
  }

  if (pathname === '/api/prizes/import' && method === 'POST') {
    requireAdmin(req, url);
    const body = await readBody(req);
    return json(res, 200, store.importPrizes(body.activityId, body.rows, body.mode));
  }

  const prizeMatch = pathname.match(/^\/api\/prizes\/([\w-]+)$/);
  if (prizeMatch && method === 'PATCH') {
    requireAdmin(req, url);
    const body = await readBody(req);
    return json(res, 200, { prize: store.adjustPrize(prizeMatch[1], body) });
  }
  if (prizeMatch && method === 'DELETE') {
    requireAdmin(req, url);
    return json(res, 200, store.deletePrize(prizeMatch[1]));
  }

  if (pathname === '/api/join/activity' && method === 'GET') {
    const code = (searchParams.get('code') || '').trim().toUpperCase();
    let act = code ? store.getState().activities.find((a) => a.code === code) : null;
    if (code && !act) throw new store.ApiError(404, '活动码无效，请重新扫描现场二维码');
    if (!act) act = store.getState().activities.find((a) => a.id === store.getState().currentActivityId) || store.getState().activities[0];
    if (!act) throw new store.ApiError(404, '活动不存在，请确认二维码是否正确');
    return json(res, 200, {
      activity: { id: act.id, name: act.name, code: act.code, status: act.status },
      prizeCount: store.getState().prizes.filter((p) => p.activityId === act.id).length,
    });
  }

  if (pathname === '/api/join/verify' && method === 'POST') {
    if (!checkRateLimit(req)) throw new store.ApiError(429, '尝试过于频繁，请稍后再试');
    const body = await readBody(req);
    return json(res, 200, store.verifyParticipant(body.activityId, body));
  }

  if (pathname === '/api/join/state' && method === 'GET') {
    return json(res, 200, store.participantState(searchParams.get('token')));
  }

  if (pathname === '/api/join/scratch' && method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, store.scratch(body.token, body.roundId));
  }

  if (pathname === '/api/rounds' && method === 'POST') {
    requireAdmin(req, url);
    const body = await readBody(req);
    const result = store.openRound(body.activityId, body);
    store.broadcast(body.activityId, { type: 'round.opened', round: result.round, prize: result.prize });
    return json(res, 201, result);
  }

  const closeMatch = pathname.match(/^\/api\/rounds\/([\w-]+)\/close$/);
  if (closeMatch && method === 'POST') {
    requireAdmin(req, url);
    const body = await readBody(req);
    const result = store.closeRound(body.activityId, { roundId: closeMatch[1], voidPending: body.voidPending, actor: body.actor });
    store.broadcast(body.activityId, {
      type: 'round.closed',
      round: result.round,
      stats: result.stats,
    });
    return json(res, 200, result);
  }

  const rollbackMatch = pathname.match(/^\/api\/rounds\/([\w-]+)\/rollback$/);
  if (rollbackMatch && method === 'POST') {
    requireAdmin(req, url);
    const body = await readBody(req);
    const result = store.rollbackRound(body.activityId, { roundId: rollbackMatch[1], actor: body.actor });
    store.broadcast(body.activityId, { type: 'round.rolledback', roundId: rollbackMatch[1] });
    return json(res, 200, result);
  }

  if (pathname === '/api/awards/manual' && method === 'POST') {
    requireAdmin(req, url);
    const body = await readBody(req);
    const award = store.manualAward(body.activityId, body);
    store.broadcast(body.activityId, { type: 'award.manual', award });
    return json(res, 201, { award });
  }

  const voidMatch = pathname.match(/^\/api\/awards\/([\w-]+)\/void$/);
  if (voidMatch && method === 'POST') {
    requireAdmin(req, url);
    const body = await readBody(req);
    const result = store.voidAward(voidMatch[1], body);
    store.broadcast(body.activityId, {
      type: 'award.void',
      awardId: voidMatch[1],
      replacement: result.replacement,
    });
    return json(res, 200, result);
  }

  if (pathname === '/api/settings' && method === 'POST') {
    requireAdmin(req, url);
    const body = await readBody(req);
    return json(res, 200, { settings: store.updateSettings(body) });
  }

  const clearMatch = pathname.match(/^\/api\/activities\/([\w-]+)\/clear$/);
  if (clearMatch && method === 'POST') {
    requireAdmin(req, url);
    return json(res, 200, store.resetActivityData(clearMatch[1]));
  }

  if (pathname === '/api/data/reset' && method === 'POST') {
    requireAdmin(req, url);
    store.resetAll();
    store.broadcast(store.getState().currentActivityId, { type: 'state.reset' });
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/template.xlsx' && method === 'GET') {
    const type = searchParams.get('type') === 'prizes' ? 'prizes' : 'participants';
    const { buildXlsx } = require('./lib/xlsx');
    const sheets =
      type === 'prizes'
        ? [{
            name: '奖项配置',
            columns: [
              { header: '奖项名称', width: 30 },
              { header: '等级', width: 14 },
              { header: '数量', width: 12 },
              { header: '备注', width: 26 },
            ],
            rows: [
              ['特等奖 · 戴森吹风机', '特等奖', 1, '年度锦鲤'],
              ['一等奖 · AirPods Pro', '一等奖', 3, ''],
              ['二等奖 · 精品咖啡礼盒', '二等奖', 8, ''],
            ],
          }, {
            name: '填写说明',
            title: '奖项导入说明',
            columns: [{ header: '说明', width: 90 }],
            rows: [
              ['1. 请在「奖项配置」工作表中填写，第一行为表头，从第二行开始写数据。'],
              ['2. 数量为奖项的库存总数，开奖时按名额扣减，剩余为 0 时无法继续开奖。'],
              ['3. 同名奖项只能存在一个，导入后仍可在页面上调整库存。'],
              ['4. 保存为 .xlsx 或 .csv 后，回到「名单与奖项」页面导入。'],
            ],
          }]
        : [{
            name: '参与者名单',
            columns: [
              { header: '姓名', width: 16 },
              { header: '证件后四位', width: 16 },
              { header: '部门/门店', width: 24 },
              { header: '手机号', width: 18 },
            ],
            rows: [
              ['张三', '1024', '总部 · 市场部', '13800001234'],
              ['李四', '2048', '华东大区 · 上海静安店', '13900005678'],
              ['王五', '3721', '电商中心', ''],
            ],
          }, {
            name: '填写说明',
            title: '参与者导入说明',
            columns: [{ header: '说明', width: 90 }],
            rows: [
              ['1. 请在「参与者名单」工作表中填写，第一行为表头，从第二行开始写数据。'],
              ['2. 证件后四位用于现场身份核验，请确保与参与者本人证件一致。'],
              ['3. 姓名 + 证件后四位 的组合必须唯一，重复行会在导入时自动跳过。'],
              ['4. 保存为 .xlsx 或 .csv 后，回到「名单与奖项」页面导入。'],
            ],
          }];
    const buffer = buildXlsx(sheets);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${type}-template.xlsx"; filename*=UTF-8''${encodeURIComponent(type === 'prizes' ? '奖项导入模板.xlsx' : '参与者导入模板.xlsx')}`,
      'Content-Length': buffer.length,
    });
    return res.end(buffer);
  }

  if (pathname === '/api/import/parse' && method === 'POST') {
    requireAdmin(req, url);
    const body = await readBody(req);
    const raw = String(body.data || '');
    const base64 = raw.includes(',') ? raw.split(',').pop() : raw;
    const buf = Buffer.from(base64, 'base64');
    if (!buf.length) throw new store.ApiError(400, '文件内容为空');
    if (buf.length > 8 * 1024 * 1024) throw new store.ApiError(413, '文件请控制在 8MB 以内');
    try {
      const { readWorkbook } = require('./lib/xlsx-read');
      const rows = readWorkbook(buf);
      return json(res, 200, { rows: rows.slice(0, 5000) });
    } catch (err) {
      throw new store.ApiError(400, `无法解析该文件：${err.message}`);
    }
  }

  if (pathname === '/api/backup.json' && method === 'GET') {
    requireAdmin(req, url);
    const body = JSON.stringify(store.getState(), null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="lucky-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'Content-Length': Buffer.byteLength(body),
    });
    return res.end(body);
  }

  if (pathname === '/api/export-participants.xlsx' && method === 'GET') {
    requireAdmin(req, url);
    const activityId = searchParams.get('activityId') || store.getState().currentActivityId;
    const act = store.getActivity(activityId);
    const buffer = store.exportParticipantsWorkbook(act.id);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const filename = `${act.name}-参与者名单-${stamp}.xlsx`;
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="participants-${stamp}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': buffer.length,
    });
    return res.end(buffer);
  }

  if (pathname === '/api/export.xlsx' && method === 'GET') {
    requireAdmin(req, url);
    const activityId = searchParams.get('activityId') || store.getState().currentActivityId;
    const act = store.getActivity(activityId);
    const buffer = store.exportWorkbook(act.id);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const filename = `${act.name}-中奖记录-${stamp}.xlsx`;
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="export-${stamp}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': buffer.length,
    });
    return res.end(buffer);
  }

  throw new store.ApiError(404, '接口不存在');
}

/* ---------------------------- server ----------------------------- */

store.init();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Pin',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    });
    return res.end();
  }

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (err) {
    fail(res, err);
  }
});

server.listen(PORT, HOST, () => {
  const addrs = networkAddresses();
  console.log('');
  console.log('  LUCKY 现场抽奖系统 已启动');
  console.log('  ───────────────────────────────────────────');
  console.log(`  本机访问   http://localhost:${PORT}`);
  addrs.forEach((ip) => console.log(`  局域网     http://${ip}:${PORT}   （手机扫码用这个）`));
  console.log('  ───────────────────────────────────────────');
  console.log('  主持人台 /host   大屏 /screen   参与者 /join');
  console.log('');
});
