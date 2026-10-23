'use strict';

/** 首次启动时写入的演示数据，便于直接体验完整流程 */

const NAMES = [
  '陈嘉禾', '林知远', '周予安', '苏晚晴', '沈亦舟', '许清和', '何知微', '顾言川',
  '江小满', '温以宁', '白露生', '叶南乔', '罗一鸣', '程星野', '唐婉宁', '邵子昂',
  '方知夏', '孟今朝', '傅明轩', '崔雨桐', '范思远', '彭书宁', '董千寻', '袁近南',
  '钟以恒', '邹文君', '蒋雨眠', '武嘉树', '石见微', '常安宁', '乔远山', '贺清川',
  '施南风', '金亦辰', '樊晓星', '尹知秋', '柳岸青', '阚朝夕', '路明非', '简知白',
  '任清越', '万予星', '葛南枝', '戚长歌', '谢知遇', '章叙白', '云舒然', '鹿听澜',
  '梁又年', '席温言', '卫子衿', '屈晚舟', '殷向晚', '汲清让', '褚星阑', '霍知许',
  '连翘', '应寒山', '闻朝暮', '卓南音',
];

const DEPTS = [
  '总部 · 市场部', '总部 · 品牌部', '总部 · 人力行政', '华东大区 · 上海静安店',
  '华东大区 · 杭州湖滨店', '华南大区 · 深圳福田店', '华北大区 · 北京朝阳店',
  '西南大区 · 成都太古里店', '电商中心', '客户成功部',
];

function seed(uid, now) {
  const createdAt = now() - 1000 * 60 * 60 * 26;
  const activityId = uid('act');

  const activity = {
    id: activityId,
    name: '2026 新春年会 · 幸运时刻',
    code: 'LUCKY8',
    status: 'live',
    createdAt,
    settings: { allowDuplicateWin: false, autoVoidOnClose: true, requirePhone: false },
    lastSeq: 0,
  };

  const participants = NAMES.map((name, i) => ({
    id: uid('p'),
    activityId,
    name,
    id4: String(1000 + ((i * 617) % 9000)).slice(-4),
    phone: `138${String(10000000 + i * 137).slice(-8)}`,
    dept: DEPTS[i % DEPTS.length],
    remark: '',
    verifiedAt: i < 18 ? createdAt + 1000 * 60 * (i + 6) : null,
    sessions: [],
    createdAt,
  }));

  const prizeDefs = [
    { name: '特等奖 · 戴森吹风机', level: '特等奖', total: 1, note: '年度锦鲤' },
    { name: '一等奖 · AirPods Pro', level: '一等奖', total: 2, note: '' },
    { name: '二等奖 · 精品咖啡礼盒', level: '二等奖', total: 5, note: '' },
    { name: '三等奖 · 定制保温杯', level: '三等奖', total: 12, note: '' },
    { name: '幸运奖 · 50 元无门槛券', level: '幸运奖', total: 20, note: '现场即时核销' },
  ];

  const prizes = prizeDefs.map((p, i) => ({
    id: uid('pr'),
    activityId,
    name: p.name,
    level: p.level,
    total: p.total,
    remaining: p.total,
    note: p.note,
    createdAt: createdAt + i,
  }));

  return {
    currentActivityId: activityId,
    activities: [activity],
    participants,
    prizes,
    rounds: [],
    awards: [],
    logs: [
      {
        id: uid('log'),
        activityId,
        ts: createdAt,
        action: 'activity.create',
        detail: '创建活动「2026 新春年会 · 幸运时刻」',
        actor: '系统',
        extra: { demo: true },
      },
      {
        id: uid('log'),
        activityId,
        ts: createdAt + 1000,
        action: 'participants.import',
        detail: `导入参与者 ${participants.length} 人`,
        actor: '系统',
        extra: { demo: true },
      },
      {
        id: uid('log'),
        activityId,
        ts: createdAt + 2000,
        action: 'prizes.import',
        detail: `导入奖项 ${prizes.length} 项`,
        actor: '系统',
        extra: { demo: true },
      },
    ],
  };
}

module.exports = { seed };
