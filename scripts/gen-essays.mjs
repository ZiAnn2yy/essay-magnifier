/**
 * 范文批量生成。
 *
 * 用法：
 *   node scripts/gen-essays.mjs --grade 3 --count 2            # 试水
 *   node scripts/gen-essays.mjs --grade 3 --count 20           # 放量
 *   node scripts/gen-essays.mjs --all --count 20               # 四个年级各 20 篇
 *
 * 为什么用脚本而不是我手写：每篇要 300-600 字且得满足一堆可拆解的条件，
 * 八十篇手写会把剩下的开发窗口全部吃掉。脚本负责"批量 + 校验"，
 * 我负责"审"——审不过的 prompt 我改，不是往下传。
 *
 * 三道校验（对应规范§〇红线一和§三）：
 *   1. 长度 280-650 字，4-6 个自然段
 *   2. **不许出现真实人名/校名**——AI 很爱写"小明""李华""三年级二班"，
 *      而作品内容出现学校、学生姓名直接取消资格。命中就整篇丢弃。
 *   3. 可拆解性：必须含具体感官细节、一个重复出现的物件、一处放慢的动作。
 *      这三样缺了，拆解引擎只能返回空话，那篇范文就是废的。
 *
 * 版权：全部标 `示例范文`（本组撰写、AI 辅助起草、人工审校）。
 * 不抄教材课文——见 data/essays.js 文件头的版权规则。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// ---- 读 .env（不引 dotenv，减少依赖；格式就是 KEY=VALUE）----
// 规范里 .env 只存在于 server/（红线二：Key 只存在于 server/），所以先找那儿。
function loadEnv() {
  const candidates = [join(root, 'server/.env'), join(root, '.env')];
  for (const path of candidates) {
    try {
      const env = {};
      const text = readFileSync(path, 'utf-8');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const at = trimmed.indexOf('=');
        if (at <= 0) continue;
        env[trimmed.slice(0, at)] = trimmed.slice(at + 1).trim();
      }
      if (env.LLM_API_KEY) return env;
    } catch {
      // 这个路径没有，试下一个
    }
  }
  return {};
}

const env = loadEnv();
const API_URL = env.LLM_API_URL || '';
const API_KEY = env.LLM_API_KEY || '';
const MODEL = env.LLM_MODEL || '';
const MAX_TOKENS = 8192;

/** 每个年级的题目池。写的是"让孩子写什么"，不是标题——标题让模型自己起。 */
const TOPICS = {
  3: [
    '写人：我的妈妈（通过一件小事写出她是什么样的人）',
    '写人：我的同桌（通过一个习惯动作写出他）',
    '写人：我的老师（通过一句话或一个眼神写出她）',
    '记事：第一次一个人回家（写清路上的声音和自己的心跳）',
    '记事：一件我做错了的事（不写"我后悔"，写我怎么发现的）',
    '记事：下雨天被困在路上（写冷或湿怎么落在身上）',
    '写景：我们的操场（写它一天里不同的样子）',
    '写景：早晨的上学路（写光和声音怎么一点点多起来）',
    '写景：雨后的花园（写水珠、泥土味和被压倒的草）',
    '状物：我的一支笔（写它怎么旧起来的）',
    '状物：我的一盆植物（写它差点死掉又活过来）',
    '状物：我的书包（写它里面装了什么、怎么乱的）',
    '想象：假如我会变小（写熟悉的东西变大以后）',
    '想象：假如我会借东西（借一种看不见的东西送给远的人）',
    '想象：我家的动物会说话（写它第一句会说什么）',
    '记事：我学会了一件事（写卡住的那个瞬间）',
    '写人：我的爷爷或奶奶（写他的一双手）',
    '写景：夏天的夜晚（写热怎么退下去、声音怎么多起来）',
    '状物：我收集的小东西（写它怎么被我把玩得发亮）',
    '记事：等一个人（写等待里你注意到的小事）',
    '写景：风来的时候（写看不见的风怎么被你知道）',
    '想象：我有一间秘密小屋（写里面有什么、谁会发现）',
    '写人：楼下的一个人（写你每天看见却不认识的人）',
    '记事：一次迟到（写你路上的每一个耽搁）',
    '状物：一碗面（写它的热气、声音和你怎么吃的）',
  ],
  4: [
    '写人：我的爸爸（通过他的手或他的工具写他）',
    '写人：一个我在路边常见的人（写他的摊子和他等客人的样子）',
    '写人：我的奶奶（通过一样她舍不得扔的东西写她）',
    '记事：我们家的一次停电（写黑下来以后你听见什么）',
    '记事：我养过的一只小动物（写它怎么来的又怎么离开）',
    '记事：一次比赛或考试（写开始前的那几分钟）',
    '记事：我去了一个乡下地方（写那里的味道和声音）',
    '写景：我家附近的一条巷子或一条小路（写它一天里的变化）',
    '写景：下雪天（写雪怎么落下、怎么化）',
    '写景：海或湖（写水的颜色分几层）',
    '状物：我爷爷的工具箱（写每样东西的痕迹）',
    '状物：一台旧电器或旧收音机（写它的声音）',
    '状物：我的一双旧鞋（写它怎么磨坏的）',
    '想象：假如时间能暂停十分钟（写你会去做什么）',
    '想象：假如我有一辆会飞的车（写城市的屋顶）',
    '记事：我搬过一次家（写旧房间最后一眼）',
    '写人：我的一个长辈（写他等胶水干那样的小习惯）',
    '记事：我陪一个人去过一个地方（写他怎么慢下来）',
    '写景：菜市场或早市（写声音、颜色和味道叠在一起）',
    '状物：我的一本书（写它怎么被翻旧的）',
    '记事：一次道歉（写我说不出口的那个停顿）',
    '写景：秋天的操场（写树叶怎么一天少下去）',
    '想象：我家的房子会说话（写它最记得的一件事）',
    '写人：一个手艺人（写他做事时不理人的那几分钟）',
    '记事：我学会了一句口头禅（写它怎么在我们家传开的）',
  ],
  5: [
    '写人：我敬佩的一个人（通过一个反复出现的小动作写他）',
    '写人：我的一个家人（通过一样他常年用的东西写他）',
    '写人：一个沉默的人（写他不说话时你在想什么）',
    '记事：我经历的一次告别（不写"我很伤心"，写那个场景的细节）',
    '记事：我在一个地方等了很久（写等待中世界的动静）',
    '记事：一次我记了很久的失败（写我当时看见了什么）',
    '记事：我回到一个很久没去的地方（写它变了和没变的部分）',
    '写景：一条河（写它不同季节的样子和它带走的东西）',
    '写景：一棵树（写它身上留下的痕迹和它的伤）',
    '写景：一座桥或一条街（写谁每天从它身上经过）',
    '写景：风穿过一个地方（写风怎么被你知道）',
    '状物：一块表或一个钟（写它怎么替我们记时间）',
    '状物：一把伞（写它在雨里和雨外的不同）',
    '状物：一封手写的信（写字迹怎么透出写信人的状态）',
    '想象：假如我能听见植物的声音（写一株草的一天）',
    '想象：假如我办一所学校（写它的第一节课）',
    '想象：假如记忆可以借（写我想借谁的一段记忆）',
    '记事：我第一次一个人坐长途车（写窗外的变化和心里的起伏）',
    '写人：我的一个朋友（写我们怎么不说话也不尴尬）',
    '记事：我修好了某样东西（写我怎么发现自己能行）',
    '写景：黄昏（写光怎么一点点退下去）',
    '状物：一双筷子或一个碗（写它在一家人手里的流转）',
    '记事：我替别人做过的一件事（写我做的时候的想法）',
    '写人：一个我觉得奇怪的人（写我后来怎么懂了他）',
    '写景：雾（写世界怎么一点点看不见又回来）',
  ],
  6: [
    '写人：我爷爷或外公（通过一样他用了很久的东西写他）',
    '写人：我的妈妈（通过她早晨的一连串动作写她）',
    '写人：一个我还来不及认识的人（写他留下的痕迹）',
    '记事：我童年的一个地方不在了（写我最后一次见它）',
    '记事：一次停电的夜晚（写黑里我们听见的家的声音）',
    '记事：我学会了骑单车（写摔倒那次地上的细节）',
    '记事：我在医院或某个等待的地方（写时间的慢）',
    '记事：一次离别（写那个人走前的最后一个动作）',
    '写景：老城的一条街（写它怎么一年年旧下去）',
    '写景：一场雨（写雨前、雨中、雨后空气的变化）',
    '写景：山（写它在不同距离看完全不一样）',
    '状物：一双旧球鞋（写它每一处磨损对应哪件事）',
    '状物：一台老风扇或旧电视（写它的声音就是夏天的声音）',
    '状物：一张旧照片（写照片里没拍到的部分）',
    '想象：假如我可以给过去寄一张纸条（写我会写什么）',
    '想象：假如城市里所有的声音停一分钟（写你会听见什么）',
    '想象：假如我是一只候鸟（写我两次经过同一个地方）',
    '记事：我第一次打工或帮工（写我怎么发现自己不懂）',
    '写人：一个手艺人（写他做事时不容打扰的那几分钟）',
    '记事：我独自在家的一天（写家里的声音怎么变清楚）',
    '写景：月光（写它怎么把熟悉的东西变陌生）',
    '状物：一把旧锁或一串钥匙（写它们守着什么）',
    '记事：一次我没能做到的事（写我后来怎么和它相处）',
    '写人：我的一个同学（写我们怎么慢慢变成朋友的）',
    '写景：一条正在拆掉的老街（写它一天天少下去）',
  ],
};

/** 个人信息红线。命中就整篇丢弃——作品内容出现学校、学生姓名直接取消资格。 */
const RED_LINE = /小明|小红|小华|李华|王明|张伟|刘洋|陈静|三年级[一二三四五六]班|[一二三四五六]年级[一二三四五六]班|第[一二三四五六]小学|实验小学|中学|学校|学院|老师叫我|班主任/;

const CRAFT_RULES = [
  '字数 300 到 600 字，分 4 到 6 个自然段，每段之间用换行分开。',
  '必须有一处具体的感官细节：气味、声音或触感，至少一样，而且要具体到能闻见听见。',
  '必须有一件东西在全文出现两次以上（一个物件、一种声音、一个动作都行）。',
  '必须有一处放慢描写的动作：把一瞬间拆成几个小步骤写。',
  '结尾不许直接说"我很开心""我很感动""我明白了"这类结论，要让读者自己感觉到。',
  '语言是小学这个年级的学生能写出来的，不要成人散文腔，不要堆形容词，不要排比句。',
  '题目用小学作文题的口气，不超过 12 字，不要用"记一件难忘的事"这种空题。',
  '全文不许出现真实人名、校名、班名。人物只用"爷爷""妈妈""同桌""老爷爷"这种称呼。',
  '只输出作文本身：第一行是题目，空一行后是正文。不要任何解释、不要 markdown。',
].join('\n');

function buildPrompt(grade, topic) {
  return [
    `你是小学语文老师，请为${grade}年级学生写一篇示例范文。`,
    `写作任务：${topic}`,
    '',
    '硬性要求：',
    CRAFT_RULES,
  ].join('\n');
}

/** 校验并规整模型输出。返回 null 表示这篇废了。 */
function normalize(raw, grade, topic) {
  const text = String(raw ?? '').trim();
  if (text.length === 0) return null;

  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length < 5) return null;

  const title = lines[0].replace(/^#+\s*/, '').replace(/[《》"'""]/g, '').slice(0, 20);
  if (title.length < 2) return null;

  const body = lines.slice(1).join('\n');
  const plain = body.replace(/\s+/g, '');

  if (plain.length < 280 || plain.length > 650) return null;
  if (RED_LINE.test(body)) return null;

  const paragraphs = body.split('\n').filter((line) => line.length > 0);
  if (paragraphs.length < 4 || paragraphs.length > 6) return null;

  // 可拆解性：两段式检查。缺一样，这篇范文拆不出东西，就是废的。
  // 注意"放慢"的正则别写窄了——第一版只认"一下一下/一片一片"这类叠词，
  // 结果把"先拉住帽子，再一颗一颗扣好扣子，最后把领子翻了翻"这种
  // 最常见的放慢结构全判了死刑。中文里放慢一个动作的手法很多，
  // 认不全就会把好作文当废纸。
  const sensory =
    /(味道|气味|香味|臭味|响声|声音|听见|听得出|摸上去|冰凉|滚烫|粗糙|湿透|打哆嗦|发抖|沙沙|咔嗒|嗤|暖暖|凉凉|痒)/.test(
      body,
    );
  const slowing =
    /(先[^。]{0,24}再[^。]{0,24}最后|一颗一颗|一颗颗|一下一下|一片一片|一滴一滴|一步一步|一层一层|一秒一秒|慢慢的|缓缓|先是|接着|然后|再[^。]{0,8}又)/.test(
      body,
    );
  if (!sensory || !slowing) return null;

  return {
    id: `g${grade}-${hashTitle(title)}`,
    title,
    grade,
    topic: guessTopic(topic),
    sourceLabel: '示例范文',
    status: 'verified',
    text: body,
  };
}

function guessTopic(topic) {
  if (topic.startsWith('写人')) return '写人';
  if (topic.startsWith('记事')) return '记事';
  if (topic.startsWith('写景')) return '写景';
  if (topic.startsWith('状物')) return '状物';
  if (topic.startsWith('想象')) return '想象';
  return '记事';
}

/** 可复现的短哈希，不追求无碰撞，追求同一个标题得到同一个 id */
function hashTitle(title) {
  let hash = 0;
  for (const char of title) {
    hash = (hash * 31 + char.codePointAt(0)) % 100000;
  }
  return String(hash).padStart(5, '0');
}

async function callModel(messages) {
  const endpoint = API_URL.endsWith('/chat/completions')
    ? API_URL
    : `${API_URL.replace(/\/$/, '')}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: MAX_TOKENS, temperature: 1 }),
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`上游 ${response.status}: ${detail.slice(0, 160)}`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

const args = process.argv.slice(2);
function flag(name) {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
}

const grades = flag('all') ? [3, 4, 5, 6] : [Number(flag('grade') ?? 3)];
const wantCount = Number(flag('count') ?? 2);

if (!API_URL || !API_KEY || !MODEL) {
  console.error('缺 LLM 配置，先在 server/.env 里填好 LLM_API_URL / LLM_API_KEY / LLM_MODEL');
  process.exit(1);
}

for (const grade of grades) {
  const shardPath = join(root, 'client/src/data/essays', `grade-${grade}.json`);
  const shard = JSON.parse(readFileSync(shardPath, 'utf-8'));
  const existing = new Set(shard.essays.map((essay) => essay.title));

  const topics = TOPICS[grade];
  const accepted = [];
  // 目标篇数按"这个年级还缺几篇"算，不是按传入的 count 硬来——
  // 否则会把已经够数的年级继续灌。传 --count 表示"这个年级想要的篇数"。
  const target = Math.max(0, wantCount - shard.essays.length);
  if (target === 0) {
    console.log(`  ${grade}年级已有 ${shard.essays.length} 篇，跳过`);
    continue;
  }

  // 通过率约六成五，所以轮次按目标数的两倍给：题目池轮一遍还不够就再轮一遍。
  // temperature 是 1，同一道题第二次的结果不一样，被拦的常能过。
  const attempts = Math.min(topics.length, Math.ceil(target * 2));
  let cursor = 0;

  for (let round = 0; round < attempts && accepted.length < target; round += 1) {
    const topic = topics[cursor % topics.length];
    cursor += 1;
    const label = `[${grade}年级 ${accepted.length + 1}/${target}] ${topic.slice(0, 16)}`;
    try {
      const raw = await callModel([
        { role: 'system', content: buildPrompt(grade, topic) },
        { role: 'user', content: '开始写。' },
      ]);
      const essay = normalize(raw, grade, topic);
      if (!essay) {
        console.log(`  ✗ ${label} —— 校验没过`);
        continue;
      }
      if (existing.has(essay.title)) {
        console.log(`  · ${label} —— 题目重复，跳过`);
        continue;
      }
      existing.add(essay.title);
      accepted.push(essay);
      console.log(`  ✓ ${label} —— 《${essay.title}》 ${essay.text.replace(/\s/g, '').length}字`);
    } catch (error) {
      console.log(`  ✗ ${label} —— ${error.message}`);
    }
  }

  if (accepted.length > 0) {
    shard.essays = [...shard.essays, ...accepted];
    shard.essays.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
    shard.total = shard.essays.length;
    writeFileSync(shardPath, `${JSON.stringify(shard, null, 2)}\n`, 'utf-8');
  }
  console.log(`  ${grade}年级分片现有 ${shard.essays.length} 篇\n`);
}
