'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildXlsx } = require('./xlsx');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

const uid = (prefix) => `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
const now = () => Date.now();

class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/* ------------------------------------------------------------------ */
/* 持久化                                                              */
/* ------------------------------------------------------------------ */

function emptyState() {
  return {
    version: 1,
    settings: {
      adminPinEnabled: false,
      adminPin: '8888',
      sound: true,
    },
    currentActivityId: null,
    activities: [],
    participants: [],
    prizes: [],
    rounds: [],
    awards: [],
    logs: [],
  };
}

function loadState() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.activities)) return null;
    return { ...emptyState(), ...parsed, settings: { ...emptyState().settings, ...(parsed.settings || {}) } };
  } catch (err) {
    try {
      fs.renameSync(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`);
    } catch (_) {
      /* ignore */
    }
    return null;
  }
}

let state = null;
let saveTimer = null;
let dirty = false;

function persistNow() {
  if (!dirty) return;
  dirty = false;
  const tmp = `${DATA_FILE}.tmp`;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error('[store] 持久化失败:', err.message);
  }
}

function save() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, 120);
}

function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  persistNow();
}

process.on('exit', flush);
process.on('SIGINT', () => {
  flush();
  process.exit(0);
});
process.on('SIGTERM', () => {
  flush();
  process.exit(0);
});

/* ------------------------------------------------------------------ */
/* 通用工具                                                            */
/* ------------------------------------------------------------------ */

function log(activityId, action, detail, meta = {}) {
  const entry = {
    id: uid('log'),
    activityId: activityId || null,
    ts: now(),
    action,
    detail,
    actor: meta.actor || '系统',
    extra: meta.extra || null,
  };
  state.logs.push(entry);
  if (state.logs.length > 8000) state.logs.splice(0, state.logs.length - 8000);
  return entry;
}

function getActivity(id) {
  const act = state.activities.find((a) => a.id === id) || state.activities.find((a) => a.id === state.currentActivityId);
  if (!act) throw new ApiError(404, '活动不存在');
  return act;
}

function normalizeName(name) {
  return String(name || '').replace(/\s+/g, '').trim();
}

function normalizeId4(v) {
  return String(v || '').trim().toUpperCase();
}

function maskId(id4) {
  return id4 ? `****${id4}` : '';
}

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

function sample(arr, k) {
  const pool = arr.slice();
  const picked = [];
  for (let i = 0; i < k && pool.length; i++) {
    const j = crypto.randomInt(pool.length);
    picked.push(pool[j]);
    pool[j] = pool[pool.length - 1];
    pool.pop();
  }
  return picked;
}

/* ------------------------------------------------------------------ */
/* 活动                                                               */
/* ------------------------------------------------------------------ */

function listActivities() {
  return state.activities
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((a) => {
      const participants = state.participants.filter((p) => p.activityId === a.id);
      const awards = state.awards.filter((w) => w.activityId === a.id && w.status !== 'void');
      return {
        id: a.id,
        name: a.name,
        code: a.code,
        status: a.status,
        createdAt: a.createdAt,
        participantCount: participants.length,
        verifiedCount: participants.filter((p) => p.verifiedAt).length,
        prizeCount: state.prizes.filter((p) => p.activityId === a.id).length,
        awardCount: awards.length,
      };
    });
}

function createActivity({ name, allowDuplicateWin = false, autoVoidOnClose = true } = {}) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new ApiError(400, '请填写活动名称');
  if (cleanName.length > 40) throw new ApiError(400, '活动名称请控制在 40 字以内');

  let code = randomCode();
  while (state.activities.some((a) => a.code === code)) code = randomCode();

  const activity = {
    id: uid('act'),
    name: cleanName,
    code,
    status: 'draft',
    createdAt: now(),
    settings: {
      allowDuplicateWin: !!allowDuplicateWin,
      autoVoidOnClose: autoVoidOnClose !== false,
      requirePhone: false,
    },
    lastSeq: 0,
  };
  state.activities.push(activity);
  if (!state.currentActivityId) state.currentActivityId = activity.id;
  log(activity.id, 'activity.create', `创建活动「${cleanName}」`);
  save();
  return activity;
}

function setCurrentActivity(id) {
  const act = getActivity(id);
  state.currentActivityId = act.id;
  save();
  return act;
}

function updateActivity(id, patch = {}) {
  const act = getActivity(id);
  if (typeof patch.name === 'string') {
    const cleanName = patch.name.trim();
    if (!cleanName) throw new ApiError(400, '活动名称不能为空');
    act.name = cleanName;
  }
  if (typeof patch.status === 'string' && ['draft', 'live', 'closed'].includes(patch.status)) {
    act.status = patch.status;
    log(act.id, 'activity.status', `活动状态切换为「${statusText(act.status)}」`);
  }
  if (patch.settings && typeof patch.settings === 'object') {
    if (typeof patch.settings.allowDuplicateWin === 'boolean') act.settings.allowDuplicateWin = patch.settings.allowDuplicateWin;
    if (typeof patch.settings.autoVoidOnClose === 'boolean') act.settings.autoVoidOnClose = patch.settings.autoVoidOnClose;
    if (typeof patch.settings.requirePhone === 'boolean') act.settings.requirePhone = patch.settings.requirePhone;
    log(act.id, 'activity.settings', '更新活动规则');
  }
  save();
  return act;
}

function statusText(status) {
  return { draft: '筹备中', live: '进行中', closed: '已结束' }[status] || status;
}

function deleteActivity(id) {
  const act = getActivity(id);
  if (state.awards.some((w) => w.activityId === act.id && w.status !== 'void')) {
    throw new ApiError(400, '该活动已有发奖记录，不能删除');
  }
  state.activities = state.activities.filter((a) => a.id !== act.id);
  state.participants = state.participants.filter((p) => p.activityId !== act.id);
  state.prizes = state.prizes.filter((p) => p.activityId !== act.id);
  state.rounds = state.rounds.filter((r) => r.activityId !== act.id);
  state.awards = state.awards.filter((w) => w.activityId !== act.id);
  if (state.currentActivityId === act.id) state.currentActivityId = state.activities[0]?.id || null;
  save();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 参与者                                                              */
/* ------------------------------------------------------------------ */

function importParticipants(activityId, rows = [], mode = 'append') {
  const act = getActivity(activityId);
  if (!Array.isArray(rows) || rows.length === 0) throw new ApiError(400, '没有可导入的数据');

  if (mode === 'replace') {
    const hasAward = state.awards.some((w) => w.activityId === act.id);
    if (hasAward) throw new ApiError(400, '已有发奖记录，不能覆盖导入名单');
    state.participants = state.participants.filter((p) => p.activityId !== act.id);
  }

  const existing = state.participants.filter((p) => p.activityId === act.id);
  const seen = new Map(existing.map((p) => [`${normalizeName(p.name)}|${p.id4}`, p]));
  let added = 0;
  const skipped = [];

  for (const row of rows) {
    const name = normalizeName(row.name);
    const id4 = normalizeId4(row.id4);
    if (!name) {
      skipped.push({ row, reason: '姓名为空' });
      continue;
    }
    if (!id4 || id4.length !== 4) {
      skipped.push({ row, reason: '证件后四位需为 4 位' });
      continue;
    }
    const key = `${name}|${id4}`;
    if (seen.has(key)) {
      skipped.push({ row, reason: '名单内重复' });
      continue;
    }
    const participant = {
      id: uid('p'),
      activityId: act.id,
      name,
      id4,
      phone: String(row.phone || '').trim(),
      dept: String(row.dept || row.group || '').trim(),
      remark: String(row.remark || '').trim(),
      verifiedAt: null,
      sessions: [],
      createdAt: now(),
    };
    state.participants.push(participant);
    seen.set(key, participant);
    added++;
  }

  log(act.id, 'participants.import', `导入参与者 ${added} 人${skipped.length ? `，跳过 ${skipped.length} 条` : ''}`, {
    extra: { added, skipped: skipped.length, mode },
  });
  save();
  return { added, skipped: skipped.slice(0, 30), skippedCount: skipped.length, total: state.participants.filter((p) => p.activityId === act.id).length };
}

function updateParticipant(activityId, participantId, patch = {}) {
  const act = getActivity(activityId);
  const p = state.participants.find((x) => x.id === participantId && x.activityId === act.id);
  if (!p) throw new ApiError(404, '参与者不存在');

  const nextName = patch.name !== undefined ? normalizeName(patch.name) : p.name;
  const nextId4 = patch.id4 !== undefined ? normalizeId4(patch.id4) : p.id4;

  if (!nextName) throw new ApiError(400, '姓名不能为空');
  if (!/^[0-9A-Z]{4}$/.test(nextId4)) throw new ApiError(400, '证件后四位需为 4 位字母或数字');

  const duplicate = state.participants.some(
    (x) => x.activityId === act.id && x.id !== p.id && normalizeName(x.name) === nextName && normalizeId4(x.id4) === nextId4
  );
  if (duplicate) throw new ApiError(409, '名单中已存在同名同后四位的参与者');

  p.name = nextName;
  p.id4 = nextId4;
  if (patch.dept !== undefined) p.dept = String(patch.dept || '').trim();
  if (patch.phone !== undefined) p.phone = String(patch.phone || '').trim();
  if (patch.remark !== undefined) p.remark = String(patch.remark || '').trim();

  // 同步已产生的发奖记录中的快照字段，避免报表出现旧名字
  for (const w of state.awards) {
    if (w.activityId === act.id && w.participantId === p.id) {
      w.participantName = p.name;
      w.participantDept = p.dept;
      w.participantPhone = p.phone;
    }
  }

  log(act.id, 'participant.update', `修改参与者「${p.name}」的信息`, { extra: { participantId: p.id } });
  save();
  return p;
}

function deleteParticipant(activityId, participantId) {
  const act = getActivity(activityId);
  const p = state.participants.find((x) => x.id === participantId && x.activityId === act.id);
  if (!p) throw new ApiError(404, '参与者不存在');

  const awards = state.awards.filter((w) => w.activityId === act.id && w.participantId === p.id && w.status !== 'void');
  if (awards.length) throw new ApiError(400, `「${p.name}」已有 ${awards.length} 条中奖记录，请先作废后再删除`);

  state.participants = state.participants.filter((x) => x.id !== p.id);
  log(act.id, 'participant.delete', `删除参与者「${p.name}」`, { extra: { participantId: p.id } });
  save();
  return { ok: true };
}

function resetVerification(activityId, participantId) {
  const p = state.participants.find((x) => x.id === participantId && x.activityId === activityId);
  if (!p) throw new ApiError(404, '参与者不存在');
  p.verifiedAt = null;
  p.sessions = [];
  log(activityId, 'participant.reset', `重置「${p.name}」的验证状态`);
  save();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 奖项                                                               */
/* ------------------------------------------------------------------ */

function importPrizes(activityId, rows = [], mode = 'append') {
  const act = getActivity(activityId);
  if (!Array.isArray(rows) || rows.length === 0) throw new ApiError(400, '没有可导入的数据');

  if (mode === 'replace') {
    const issued = state.awards.filter((w) => w.activityId === act.id && w.status !== 'void');
    if (issued.length) throw new ApiError(400, '已有发奖记录，不能覆盖奖项配置');
    state.prizes = state.prizes.filter((p) => p.activityId !== act.id);
  }

  const existing = state.prizes.filter((p) => p.activityId === act.id);
  let added = 0;
  const skipped = [];

  for (const row of rows) {
    const name = String(row.name || '').trim();
    const total = Number(row.total);
    if (!name) {
      skipped.push({ row, reason: '奖项名称为空' });
      continue;
    }
    if (!Number.isFinite(total) || total <= 0 || Math.floor(total) !== total) {
      skipped.push({ row, reason: '数量需为正整数' });
      continue;
    }
    if (existing.some((p) => p.name === name)) {
      skipped.push({ row, reason: '同名奖项已存在' });
      continue;
    }
    const prize = {
      id: uid('pr'),
      activityId: act.id,
      name,
      level: String(row.level || '').trim(),
      total,
      remaining: total,
      note: String(row.note || '').trim(),
      createdAt: now(),
    };
    state.prizes.push(prize);
    existing.push(prize);
    added++;
  }

  log(act.id, 'prizes.import', `导入奖项 ${added} 项${skipped.length ? `，跳过 ${skipped.length} 条` : ''}`, {
    extra: { added, skipped: skipped.length, mode },
  });
  save();
  return { added, skipped: skipped.slice(0, 30), skippedCount: skipped.length };
}

function adjustPrize(prizeId, { total, name, level } = {}) {
  const prize = state.prizes.find((p) => p.id === prizeId);
  if (!prize) throw new ApiError(404, '奖项不存在');
  const issued = state.awards.filter((w) => w.prizeId === prize.id && w.status !== 'void').length;
  if (total !== undefined) {
    const nextTotal = Number(total);
    if (!Number.isFinite(nextTotal) || nextTotal < issued) {
      throw new ApiError(400, `总数不能小于已发放数量（${issued}）`);
    }
    prize.total = Math.floor(nextTotal);
    prize.remaining = prize.total - issued;
  }
  if (typeof name === 'string' && name.trim()) prize.name = name.trim();
  if (typeof level === 'string') prize.level = level.trim();
  log(prize.activityId, 'prize.update', `调整奖项「${prize.name}」库存为 ${prize.total}`);
  save();
  return prize;
}

function deletePrize(prizeId) {
  const prize = state.prizes.find((p) => p.id === prizeId);
  if (!prize) throw new ApiError(404, '奖项不存在');
  if (state.awards.some((w) => w.prizeId === prize.id && w.status !== 'void')) {
    throw new ApiError(400, '该奖项已有发放记录，不能删除');
  }
  state.prizes = state.prizes.filter((p) => p.id !== prize.id);
  log(prize.activityId, 'prize.delete', `删除奖项「${prize.name}」`);
  save();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 身份验证                                                            */
/* ------------------------------------------------------------------ */

function verifyParticipant(activityId, { name, id4, code } = {}) {
  let act;
  if (code) {
    act = state.activities.find((a) => a.code === String(code).trim().toUpperCase());
    if (!act) throw new ApiError(404, '活动码无效，请重新扫码');
  } else {
    act = getActivity(activityId);
  }
  if (act.status === 'closed') throw new ApiError(403, '本场活动已结束，感谢参与');
  if (act.status === 'draft') throw new ApiError(403, '活动尚未开始，请稍候');

  const cleanName = normalizeName(name);
  const cleanId = normalizeId4(id4);
  if (!cleanName) throw new ApiError(400, '请输入姓名');
  if (!/^[0-9A-Z]{4}$/.test(cleanId)) throw new ApiError(400, '请输入证件后四位（4 位数字或字母）');

  const matches = state.participants.filter(
    (p) => p.activityId === act.id && normalizeName(p.name) === cleanName && normalizeId4(p.id4) === cleanId
  );

  if (!matches.length) {
    log(act.id, 'verify.fail', `验证失败：${cleanName} / ${cleanId}`, { actor: '参与者' });
    save();
    throw new ApiError(401, '姓名与证件后四位不匹配，请核对或联系现场工作人员');
  }
  if (matches.length > 1) {
    throw new ApiError(409, '名单中存在同名同号记录，请联系现场工作人员处理');
  }

  const participant = matches[0];
  const token = crypto.randomBytes(24).toString('hex');
  participant.sessions = [...(participant.sessions || []).slice(-4), token];
  const firstTime = !participant.verifiedAt;
  if (firstTime) participant.verifiedAt = now();

  log(act.id, 'verify.success', `「${participant.name}」验证通过${firstTime ? '' : '（重复验证）'}`, {
    actor: '参与者',
    extra: { participantId: participant.id },
  });
  save();
  return { token, participant: publicParticipant(participant), activity: publicActivity(act), firstTime };
}

function findByToken(token) {
  if (!token) return null;
  return state.participants.find((p) => (p.sessions || []).includes(token)) || null;
}

function publicParticipant(p) {
  return { id: p.id, name: p.name, dept: p.dept, phone: p.phone, verifiedAt: p.verifiedAt };
}

function publicActivity(a) {
  return { id: a.id, name: a.name, code: a.code, status: a.status, settings: a.settings };
}

/* ------------------------------------------------------------------ */
/* 轮次与抽奖                                                          */
/* ------------------------------------------------------------------ */

function openRoundInfo(activityId) {
  return state.rounds.find((r) => r.activityId === activityId && r.status === 'open') || null;
}

function eligibleParticipants(activityId) {
  const act = getActivity(activityId);
  const winners = new Set(
    state.awards.filter((w) => w.activityId === act.id && w.status !== 'void').map((w) => w.participantId)
  );
  return state.participants.filter((p) => p.activityId === act.id && p.verifiedAt && (act.settings.allowDuplicateWin || !winners.has(p.id)));
}

function drawProof(roundId, openedAt, pool, winners) {
  const payload = [
    roundId,
    openedAt,
    pool.map((p) => p.id).sort().join(','),
    winners.map((p) => p.id).join(','),
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16).toUpperCase();
}

function openRound(activityId, { prizeId, count = 1, name } = {}) {
  const act = getActivity(activityId);
  if (act.status === 'draft') throw new ApiError(400, '请先开启扫码，再开始抽奖');
  if (openRoundInfo(act.id)) throw new ApiError(400, '当前已有进行中的轮次，请先结束本轮');

  const prize = state.prizes.find((p) => p.id === prizeId && p.activityId === act.id);
  if (!prize) throw new ApiError(400, '请选择有效奖项');

  const qty = Math.floor(Number(count));
  if (!Number.isFinite(qty) || qty < 1) throw new ApiError(400, '抽取人数至少为 1');
  if (qty > prize.remaining) throw new ApiError(400, `「${prize.name}」剩余库存仅 ${prize.remaining} 个`);

  const pool = eligibleParticipants(act.id);
  if (pool.length < qty) {
    throw new ApiError(400, `当前可参与抽奖人数不足：符合条件的仅 ${pool.length} 人，本轮需要 ${qty} 人`, {
      eligible: pool.length,
    });
  }

  const winners = sample(pool, qty);
  const createdAt = now();
  const seq = (act.lastSeq || 0) + 1;
  act.lastSeq = seq;

  const round = {
    id: uid('r'),
    activityId: act.id,
    seq,
    name: String(name || '').trim() || `第 ${seq} 轮`,
    prizeId: prize.id,
    prizeName: prize.name,
    level: prize.level,
    count: qty,
    status: 'open',
    openedAt: createdAt,
    closedAt: null,
    poolSize: pool.length,
    noneIds: [],
    proof: '',
    operator: '主持人',
  };

  const newAwards = winners.map((p) => ({
    id: uid('aw'),
    activityId: act.id,
    roundId: round.id,
    roundSeq: seq,
    prizeId: prize.id,
    prizeName: prize.name,
    level: prize.level,
    participantId: p.id,
    participantName: p.name,
    participantDept: p.dept,
    participantPhone: p.phone,
    status: 'pending',
    source: 'draw',
    assignedAt: createdAt,
    revealedAt: null,
    voidedAt: null,
    voidReason: '',
    note: '',
  }));

  round.proof = drawProof(round.id, createdAt, pool, winners);
  prize.remaining -= qty;

  state.rounds.push(round);
  state.awards.push(...newAwards);

  log(act.id, 'round.open', `开启${round.name}：${prize.name} × ${qty}，参与池 ${pool.length} 人，抽奖凭证 ${round.proof}`, {
    extra: { roundId: round.id, prizeId: prize.id, count: qty, poolSize: pool.length, proof: round.proof },
  });
  save();

  return { round, awards: newAwards, prize };
}

function closeRound(activityId, { roundId, voidPending = false, actor = '主持人' } = {}) {
  const act = getActivity(activityId);
  const round = roundId ? state.rounds.find((r) => r.id === roundId && r.activityId === act.id) : openRoundInfo(act.id);
  if (!round) throw new ApiError(404, '没有进行中的轮次');
  if (round.status !== 'open') throw new ApiError(400, '该轮次已结束');

  const roundAwards = state.awards.filter((w) => w.roundId === round.id && w.prizeId === round.prizeId);
  const pending = roundAwards.filter((w) => w.status === 'pending');

  if (pending.length && !voidPending) {
    throw new ApiError(409, `本轮还有 ${pending.length} 个奖项未被揭晓`, { pending: pending.length, needConfirm: true });
  }

  if (pending.length && voidPending) {
    for (const award of pending) {
      award.status = 'void';
      award.voidedAt = now();
      award.voidReason = '结束轮次时未揭晓，自动作废';
      const prize = state.prizes.find((p) => p.id === award.prizeId);
      if (prize) prize.remaining += 1;
    }
    log(act.id, 'award.void.batch', `${round.name}结束，作废未揭晓奖项 ${pending.length} 个`, {
      actor,
      extra: { roundId: round.id, count: pending.length },
    });
  }

  round.status = 'closed';
  round.closedAt = now();

  const stats = {
    assigned: roundAwards.length,
    revealed: roundAwards.filter((w) => w.status === 'revealed').length,
    voided: roundAwards.filter((w) => w.status === 'void').length,
    scratched: round.noneIds.length,
  };

  log(act.id, 'round.close', `结束${round.name}：揭晓 ${stats.revealed} / 分配 ${stats.assigned}`, {
    actor,
    extra: { roundId: round.id, ...stats },
  });
  save();
  return { round, stats };
}

function rollbackRound(activityId, { roundId, actor = '主持人' } = {}) {
  const act = getActivity(activityId);
  const round = roundId
    ? state.rounds.find((r) => r.id === roundId && r.activityId === act.id)
    : state.rounds.filter((r) => r.activityId === act.id).sort((a, b) => b.seq - a.seq)[0];
  if (!round) throw new ApiError(404, '轮次不存在');

  const later = state.rounds.filter((r) => r.activityId === act.id && r.seq > round.seq);
  if (later.length) throw new ApiError(400, `只能撤销最后一轮（当前最后一轮是第 ${round.seq + later.length + 1} 轮）`);

  const awards = state.awards.filter((w) => w.roundId === round.id);
  const restored = awards.filter((w) => w.status !== 'void');

  for (const award of restored) {
    const prize = state.prizes.find((p) => p.id === award.prizeId);
    if (prize) prize.remaining += 1;
  }

  const winners = restored.map((w) => `${w.participantName}（${w.prizeName}）`);

  state.awards = state.awards.filter((w) => w.roundId !== round.id);
  state.rounds = state.rounds.filter((r) => r.id !== round.id);
  if (act.lastSeq === round.seq) act.lastSeq = Math.max(round.seq - 1, 0);

  log(
    act.id,
    'round.rollback',
    `撤销第 ${round.seq} 轮「${round.prizeName}」，归还 ${restored.length} 个名额${winners.length ? `；原中奖名单：${winners.join('、')}` : ''}`,
    { actor, extra: { roundId: round.id, seq: round.seq, prizeId: round.prizeId, restored: restored.length } }
  );
  save();
  return { round, restored: restored.length, winners };
}

function manualAward(activityId, { prizeId, participantId, note = '', actor = '主持人' } = {}) {
  const act = getActivity(activityId);
  const prize = state.prizes.find((p) => p.id === prizeId && p.activityId === act.id);
  if (!prize) throw new ApiError(400, '请选择有效奖项');
  if (prize.remaining < 1) throw new ApiError(400, `「${prize.name}」库存不足`);

  const participant = state.participants.find((p) => p.id === participantId && p.activityId === act.id);
  if (!participant) throw new ApiError(400, '请选择有效参与者');

  const duplicate = state.awards.some(
    (w) => w.activityId === act.id && w.participantId === participant.id && w.prizeId === prize.id && w.status !== 'void'
  );
  if (duplicate) throw new ApiError(409, `「${participant.name}」已获得过「${prize.name}」`);

  const award = {
    id: uid('aw'),
    activityId: act.id,
    roundId: null,
    roundSeq: null,
    prizeId: prize.id,
    prizeName: prize.name,
    level: prize.level,
    participantId: participant.id,
    participantName: participant.name,
    participantDept: participant.dept,
    participantPhone: participant.phone,
    status: 'revealed',
    source: 'manual',
    assignedAt: now(),
    revealedAt: now(),
    voidedAt: null,
    voidReason: '',
    note: String(note || '').trim() || '人工补发',
  };
  state.awards.push(award);
  prize.remaining -= 1;

  log(act.id, 'award.manual', `人工补发「${prize.name}」给「${participant.name}」`, {
    actor,
    extra: { awardId: award.id, note: award.note },
  });
  save();
  return award;
}

function voidAward(awardId, { reason = '', redraw = false, actor = '主持人' } = {}) {
  const award = state.awards.find((w) => w.id === awardId);
  if (!award) throw new ApiError(404, '发奖记录不存在');
  if (award.status === 'void') throw new ApiError(400, '该记录已作废');

  const act = getActivity(award.activityId);
  award.status = 'void';
  award.voidedAt = now();
  award.voidReason = String(reason || '').trim() || '人工作废';

  const prize = state.prizes.find((p) => p.id === award.prizeId);
  if (prize) prize.remaining += 1;

  log(act.id, 'award.void', `作废「${award.participantName}」的「${award.prizeName}」：${award.voidReason}`, {
    actor,
    extra: { awardId: award.id },
  });

  let replacement = null;
  if (redraw) {
    const usedInRound = new Set(
      state.awards.filter((w) => w.roundId === award.roundId && w.status !== 'void').map((w) => w.participantId)
    );
    usedInRound.add(award.participantId);
    const pool = eligibleParticipants(act.id).filter((p) => !usedInRound.has(p.id));
    if (pool.length && prize && prize.remaining > 0) {
      const next = sample(pool, 1)[0];
      replacement = {
        id: uid('aw'),
        activityId: act.id,
        roundId: award.roundId,
        roundSeq: award.roundSeq,
        prizeId: prize.id,
        prizeName: prize.name,
        level: prize.level,
        participantId: next.id,
        participantName: next.name,
        participantDept: next.dept,
        participantPhone: next.phone,
        status: award.roundId && state.rounds.find((r) => r.id === award.roundId)?.status === 'open' ? 'pending' : 'revealed',
        source: 'redraw',
        assignedAt: now(),
        revealedAt: award.roundId && state.rounds.find((r) => r.id === award.roundId)?.status === 'open' ? null : now(),
        voidedAt: null,
        voidReason: '',
        note: `补抽（替代 ${award.participantName}）`,
      };
      state.awards.push(replacement);
      prize.remaining -= 1;
      log(act.id, 'award.redraw', `补抽「${prize.name}」给「${next.name}」`, {
        actor,
        extra: { awardId: replacement.id, replaced: award.participantName },
      });
    }
  }

  save();
  return { award, replacement };
}

/* ------------------------------------------------------------------ */
/* 参与者状态                                                          */
/* ------------------------------------------------------------------ */

function participantState(token) {
  const participant = findByToken(token);
  if (!participant) throw new ApiError(401, '登录已失效，请重新验证');
  const act = getActivity(participant.activityId);

  const round = openRoundInfo(act.id);
  const lastRound = state.rounds
    .filter((r) => r.activityId === act.id)
    .sort((a, b) => b.openedAt - a.openedAt)[0];

  const myAwards = state.awards
    .filter((w) => w.activityId === act.id && w.participantId === participant.id)
    .sort((a, b) => b.assignedAt - a.assignedAt);

  const currentAward = round ? myAwards.find((w) => w.roundId === round.id) || null : null;
  // 未刮开的奖项不返回给前端，避免提前泄露中奖结果
  const history = myAwards
    .filter((w) => w.status === 'revealed')
    .map((w) => ({
      id: w.id,
      prizeName: w.prizeName,
      level: w.level,
      status: w.status,
      roundSeq: w.roundSeq,
      revealedAt: w.revealedAt,
      assignedAt: w.assignedAt,
    }));

  let view = 'waiting';
  if (round) {
    if (!participant.verifiedAt || participant.verifiedAt > round.openedAt) view = 'late';
    else if (currentAward && currentAward.status === 'pending') view = 'card';
    else if (currentAward && currentAward.status === 'revealed') view = 'win';
    else if (currentAward && currentAward.status === 'void') view = 'void';
    else if (round.noneIds.includes(participant.id)) view = 'none';
    else view = 'card';
  } else if (lastRound && lastRound.status === 'closed') {
    view = 'idle';
  }

  return {
    activity: { id: act.id, name: act.name, status: act.status, code: act.code },
    participant: publicParticipant(participant),
    round: round
      ? {
          id: round.id,
          seq: round.seq,
          name: round.name,
          prizeName: round.prizeName,
          level: round.level,
          count: round.count,
          status: round.status,
          openedAt: round.openedAt,
        }
      : null,
    view,
    scratched: round ? round.noneIds.includes(participant.id) : false,
    award: currentAward
      ? {
          id: currentAward.id,
          prizeName: currentAward.prizeName,
          level: currentAward.level,
          status: currentAward.status,
          revealedAt: currentAward.revealedAt,
        }
      : null,
    history,
    stats: {
      totalParticipants: state.participants.filter((p) => p.activityId === act.id).length,
      verifiedCount: state.participants.filter((p) => p.activityId === act.id && p.verifiedAt).length,
    },
  };
}

function scratch(token, roundId) {
  const participant = findByToken(token);
  if (!participant) throw new ApiError(401, '登录已失效，请重新验证');
  const act = getActivity(participant.activityId);
  const round = state.rounds.find((r) => r.id === roundId && r.activityId === act.id);
  if (!round) throw new ApiError(404, '轮次不存在');
  if (round.status !== 'open') throw new ApiError(400, '本轮已结束');

  if (!participant.verifiedAt || participant.verifiedAt > round.openedAt) {
    return { result: 'late', round: { id: round.id, seq: round.seq } };
  }

  const award = state.awards.find((w) => w.roundId === round.id && w.participantId === participant.id);

  if (award && award.status === 'void') {
    return { result: 'void', award: { prizeName: award.prizeName, status: 'void' } };
  }

  if (award) {
    if (award.status === 'pending') {
      award.status = 'revealed';
      award.revealedAt = now();
      log(act.id, 'award.revealed', `「${participant.name}」刮开「${award.prizeName}」`, {
        actor: '参与者',
        extra: { awardId: award.id, roundId: round.id },
      });
      save();
      broadcast(act.id, {
        type: 'award.revealed',
        award: screenAward(award),
        roundId: round.id,
        progress: roundProgress(round),
      });
      return { result: 'win', award: { id: award.id, prizeName: award.prizeName, level: award.level, status: 'revealed' } };
    }
    return { result: award.status === 'revealed' ? 'win' : 'none', award: { id: award.id, prizeName: award.prizeName, status: award.status } };
  }

  if (!round.noneIds.includes(participant.id)) {
    round.noneIds.push(participant.id);
    log(act.id, 'scratch.none', `「${participant.name}」本轮未中奖`, { actor: '参与者', extra: { roundId: round.id } });
    save();
    broadcast(act.id, { type: 'round.progress', roundId: round.id, progress: roundProgress(round) });
  }
  return { result: 'none' };
}

function roundProgress(round) {
  const roundAwards = state.awards.filter(
    (w) => w.roundId === round.id && w.status !== 'void' && w.prizeId === round.prizeId
  );
  return {
    assigned: roundAwards.length,
    revealed: roundAwards.filter((w) => w.status === 'revealed').length,
    pending: roundAwards.filter((w) => w.status === 'pending').length,
    scratched: round.noneIds.length,
    count: round.count,
  };
}

function screenAward(award) {
  return {
    id: award.id,
    prizeName: award.prizeName,
    level: award.level,
    participantName: award.participantName,
    participantDept: award.participantDept,
    roundSeq: award.roundSeq,
    revealedAt: award.revealedAt,
  };
}

/* ------------------------------------------------------------------ */
/* 快照                                                               */
/* ------------------------------------------------------------------ */

function activitySnapshot(activityId) {
  const act = getActivity(activityId);
  const participants = state.participants.filter((p) => p.activityId === act.id);
  const prizes = state.prizes.filter((p) => p.activityId === act.id);
  const rounds = state.rounds.filter((r) => r.activityId === act.id).sort((a, b) => b.openedAt - a.openedAt);
  const awards = state.awards.filter((w) => w.activityId === act.id);
  const open = openRoundInfo(act.id);

  const verified = participants.filter((p) => p.verifiedAt);
  const activeAwards = awards.filter((w) => w.status !== 'void');

  return {
    activity: { ...publicActivity(act), createdAt: act.createdAt },
    settings: { adminPinEnabled: !!state.settings.adminPinEnabled, sound: !!state.settings.sound, hasPin: !!state.settings.adminPin },
    participants,
    prizes,
    rounds: rounds.slice(0, 40),
    awards: awards.slice().sort((a, b) => b.assignedAt - a.assignedAt).slice(0, 2000),
    openRound: open,
    progress: open ? roundProgress(open) : null,
    eligibleCount: eligibleParticipants(act.id).length,
    stats: {
      totalParticipants: participants.length,
      verifiedCount: verified.length,
      uniqueWinners: new Set(activeAwards.map((w) => w.participantId)).size,
      totalAwards: activeAwards.length,
      revealedAwards: activeAwards.filter((w) => w.status === 'revealed').length,
      pendingAwards: activeAwards.filter((w) => w.status === 'pending').length,
      voidedAwards: awards.filter((w) => w.status === 'void').length,
      scrambleCount: awards.length,
    },
    logs: state.logs
      .filter((l) => l.activityId === act.id)
      .slice()
      .reverse()
      .slice(0, 300),
  };
}

function screenSnapshot(activityId) {
  const act = getActivity(activityId);
  const prizes = state.prizes.filter((p) => p.activityId === act.id);
  const participants = state.participants.filter((p) => p.activityId === act.id);
  const open = openRoundInfo(act.id);
  const round = open || state.rounds.filter((r) => r.activityId === act.id).sort((a, b) => b.openedAt - a.openedAt)[0];

  const roundAwards = round
    ? state.awards.filter((w) => w.roundId === round.id && w.status !== 'void' && w.prizeId === round.prizeId)
    : [];
  const feed = roundAwards
    .filter((w) => w.status === 'revealed')
    .sort((a, b) => (b.revealedAt || 0) - (a.revealedAt || 0))
    .slice(0, 18)
    .map(screenAward);

  return {
    activity: { name: act.name, status: act.status, code: act.code },
    round: round
      ? {
          id: round.id,
          seq: round.seq,
          name: round.name,
          prizeName: round.prizeName,
          level: round.level,
          count: round.count,
          status: round.status,
          openedAt: round.openedAt,
          closedAt: round.closedAt,
        }
      : null,
    progress: round ? roundProgress(round) : null,
    feed,
    winners: roundAwards
      .sort((a, b) => (a.revealedAt || 0) - (b.revealedAt || 0))
      .slice(0, 40)
      .map(screenAward),
    prizes: prizes.map((p) => ({
      id: p.id,
      name: p.name,
      level: p.level,
      total: p.total,
      remaining: p.remaining,
    })),
    stats: {
      totalParticipants: participants.length,
      verifiedCount: participants.filter((p) => p.verifiedAt).length,
      winners: new Set(state.awards.filter((w) => w.activityId === act.id && w.status !== 'void').map((w) => w.participantId)).size,
    },
    settings: { sound: state.settings.sound },
  };
}

function exportWorkbook(activityId) {
  const act = getActivity(activityId);
  const participants = state.participants.filter((p) => p.activityId === act.id);
  const prizes = state.prizes.filter((p) => p.activityId === act.id);
  const awards = state.awards.filter((w) => w.activityId === act.id).sort((a, b) => a.assignedAt - b.assignedAt);
  const rounds = state.rounds.filter((r) => r.activityId === act.id).sort((a, b) => a.openedAt - b.openedAt);
  const logs = state.logs.filter((l) => l.activityId === act.id);

  const fmt = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const statusMap = { pending: '待揭晓', revealed: '已揭晓', void: '已作废' };
  const sourceMap = { draw: '系统抽取', manual: '人工补发', redraw: '异常补抽' };

  const awardRows = awards.map((w, i) => [
    i + 1,
    w.prizeName,
    w.level || '',
    w.participantName,
    w.participantDept || '',
    w.participantPhone || '',
    statusMap[w.status] || w.status,
    w.roundSeq || '',
    fmt(w.assignedAt),
    fmt(w.revealedAt),
    sourceMap[w.source] || w.source,
    w.voidReason || '',
    w.note || '',
  ]);

  const prizeRows = prizes.map((p) => {
    const issued = awards.filter((w) => w.prizeId === p.id && w.status !== 'void');
    return [
      p.name,
      p.level || '',
      p.total,
      issued.length,
      issued.filter((w) => w.status === 'revealed').length,
      issued.filter((w) => w.status === 'pending').length,
      awards.filter((w) => w.prizeId === p.id && w.status === 'void').length,
      p.remaining,
    ];
  });

  const participantRows = participants.map((p, i) => {
    const mine = awards.filter((w) => w.participantId === p.id && w.status !== 'void');
    return [
      i + 1,
      p.name,
      p.dept || '',
      p.phone || '',
      maskId(p.id4),
      p.verifiedAt ? '已验证' : '未验证',
      fmt(p.verifiedAt),
      mine.length,
      mine.map((w) => w.prizeName).join('、'),
    ];
  });

  const roundRows = rounds.map((r) => {
    const ra = awards.filter((w) => w.roundId === r.id);
    return [
      r.seq,
      r.name,
      r.prizeName,
      r.count,
      r.poolSize,
      ra.filter((w) => w.status === 'revealed').length,
      ra.filter((w) => w.status === 'void').length,
      r.noneIds.length,
      r.status === 'open' ? '进行中' : '已结束',
      fmt(r.openedAt),
      fmt(r.closedAt),
      r.proof,
    ];
  });

  const logRows = logs.map((l) => [fmt(l.ts), l.actor, l.action, l.detail]);

  const generated = fmt(now());
  return buildXlsx([
    {
      name: '中奖明细',
      title: `${act.name} · 中奖明细`,
      subtitle: `生成时间 ${generated}　活动码 ${act.code}　共 ${awards.length} 条记录`,
      columns: [
        { header: '序号', width: 6 },
        { header: '奖项', width: 18 },
        { header: '等级', width: 10 },
        { header: '中奖人', width: 12 },
        { header: '部门/门店', width: 16 },
        { header: '手机号', width: 15 },
        { header: '状态', width: 10 },
        { header: '轮次', width: 8 },
        { header: '分配时间', width: 20 },
        { header: '揭晓时间', width: 20 },
        { header: '来源', width: 12 },
        { header: '作废原因', width: 20 },
        { header: '备注', width: 18 },
      ],
      rows: awardRows,
    },
    {
      name: '奖项汇总',
      title: `${act.name} · 奖项汇总`,
      subtitle: `奖项 ${prizes.length} 项　已发放 ${awards.filter((w) => w.status !== 'void').length} 份`,
      columns: [
        { header: '奖项', width: 18 },
        { header: '等级', width: 10 },
        { header: '库存', width: 10 },
        { header: '已发放', width: 10 },
        { header: '已揭晓', width: 10 },
        { header: '待揭晓', width: 10 },
        { header: '已作废', width: 10 },
        { header: '剩余', width: 10 },
      ],
      rows: prizeRows,
    },
    {
      name: '轮次记录',
      title: `${act.name} · 轮次记录`,
      subtitle: `共 ${rounds.length} 轮`,
      columns: [
        { header: '轮次', width: 8 },
        { header: '名称', width: 14 },
        { header: '奖项', width: 18 },
        { header: '名额', width: 8 },
        { header: '参与池', width: 10 },
        { header: '已揭晓', width: 10 },
        { header: '已作废', width: 10 },
        { header: '未中奖', width: 10 },
        { header: '状态', width: 10 },
        { header: '开启时间', width: 20 },
        { header: '结束时间', width: 20 },
        { header: '抽奖凭证', width: 20 },
      ],
      rows: roundRows,
    },
    {
      name: '参与者',
      title: `${act.name} · 参与者名单`,
      subtitle: `共 ${participants.length} 人　已验证 ${participants.filter((p) => p.verifiedAt).length} 人`,
      columns: [
        { header: '序号', width: 6 },
        { header: '姓名', width: 12 },
        { header: '部门/门店', width: 18 },
        { header: '手机号', width: 15 },
        { header: '证件后四位', width: 14 },
        { header: '验证状态', width: 10 },
        { header: '验证时间', width: 20 },
        { header: '中奖次数', width: 10 },
        { header: '中奖奖项', width: 24 },
      ],
      rows: participantRows,
    },
    {
      name: '操作日志',
      title: `${act.name} · 操作日志`,
      subtitle: `共 ${logs.length} 条`,
      columns: [
        { header: '时间', width: 20 },
        { header: '操作人', width: 12 },
        { header: '动作', width: 18 },
        { header: '详情', width: 60 },
      ],
      rows: logRows,
    },
  ]);
}

function exportParticipantsWorkbook(activityId) {
  const act = getActivity(activityId);
  const participants = state.participants.filter((p) => p.activityId === act.id);
  const awards = state.awards.filter((w) => w.activityId === act.id && w.status !== 'void');
  const fmt = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return buildXlsx([
    {
      name: '参与者名单',
      title: `${act.name} · 参与者名单`,
      subtitle: `共 ${participants.length} 人　已验证 ${participants.filter((p) => p.verifiedAt).length} 人　导出时间 ${fmt(now())}`,
      columns: [
        { header: '序号', width: 6 },
        { header: '姓名', width: 14 },
        { header: '部门/门店', width: 22 },
        { header: '手机号', width: 16 },
        { header: '证件后四位', width: 14 },
        { header: '验证状态', width: 10 },
        { header: '验证时间', width: 20 },
        { header: '中奖次数', width: 10 },
        { header: '中奖奖项', width: 30 },
      ],
      rows: participants.map((p, i) => {
        const mine = awards.filter((w) => w.participantId === p.id);
        return [
          i + 1,
          p.name,
          p.dept || '',
          p.phone || '',
          maskId(p.id4),
          p.verifiedAt ? '已验证' : '未验证',
          fmt(p.verifiedAt),
          mine.length,
          mine.map((w) => w.prizeName).join('、'),
        ];
      }),
    },
  ]);
}

/* ------------------------------------------------------------------ */
/* SSE 广播                                                            */
/* ------------------------------------------------------------------ */

const clients = new Map(); // activityId -> Set(res)

function addClient(activityId, res) {
  if (!clients.has(activityId)) clients.set(activityId, new Set());
  clients.get(activityId).add(res);
}

function removeClient(activityId, res) {
  const set = clients.get(activityId);
  if (!set) return;
  set.delete(res);
  if (!set.size) clients.delete(activityId);
}

function broadcast(activityId, payload) {
  const set = clients.get(activityId);
  if (!set) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(data);
    } catch (_) {
      set.delete(res);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 初始化                                                              */
/* ------------------------------------------------------------------ */

function init() {
  state = loadState();
  if (!state) {
    const { seed } = require('./seed');
    state = { ...emptyState(), ...seed(uid, now) };
    dirty = true;
    persistNow();
    dirty = true;
  }
  return state;
}

function getSettings() {
  return {
    adminPinEnabled: !!state.settings.adminPinEnabled,
    sound: !!state.settings.sound,
    hasPin: !!state.settings.adminPin,
  };
}

function updateSettings(patch = {}) {
  if (typeof patch.adminPinEnabled === 'boolean') state.settings.adminPinEnabled = patch.adminPinEnabled;
  if (typeof patch.sound === 'boolean') state.settings.sound = patch.sound;
  if (typeof patch.adminPin === 'string' && patch.adminPin.trim()) {
    if (!/^\d{4,8}$/.test(patch.adminPin.trim())) throw new ApiError(400, '密码需为 4-8 位数字');
    state.settings.adminPin = patch.adminPin.trim();
  }
  log(state.currentActivityId, 'settings.update', '更新系统设置');
  save();
  return getSettings();
}

function checkPin(pin) {
  if (!state.settings.adminPinEnabled) return true;
  return String(pin || '') === state.settings.adminPin;
}

function resetAll() {
  const { seed } = require('./seed');
  const keepDemo = false;
  state = { ...emptyState(), ...(keepDemo ? seed(uid, now) : {}) };
  dirty = true;
  persistNow();
  dirty = false;
}

function resetActivityData(activityId) {
  const act = getActivity(activityId);
  state.participants = state.participants.filter((p) => p.activityId !== act.id);
  state.prizes = state.prizes.filter((p) => p.activityId !== act.id);
  state.rounds = state.rounds.filter((r) => r.activityId !== act.id);
  state.awards = state.awards.filter((w) => w.activityId !== act.id);
  act.lastSeq = 0;
  log(act.id, 'activity.clear', '清空活动名单、奖项与轮次');
  save();
  return { ok: true };
}

module.exports = {
  ApiError,
  init,
  getActivity,
  listActivities,
  createActivity,
  setCurrentActivity,
  updateActivity,
  deleteActivity,
  importParticipants,
  updateParticipant,
  deleteParticipant,
  resetVerification,
  importPrizes,
  adjustPrize,
  deletePrize,
  verifyParticipant,
  participantState,
  scratch,
  openRound,
  closeRound,
  rollbackRound,
  manualAward,
  voidAward,
  activitySnapshot,
  screenSnapshot,
  exportWorkbook,
  exportParticipantsWorkbook,
  addClient,
  removeClient,
  broadcast,
  getSettings,
  updateSettings,
  checkPin,
  resetAll,
  resetActivityData,
  flush,
  getState: () => state,
  roundProgress,
};
