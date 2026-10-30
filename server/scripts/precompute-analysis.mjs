/**
 * 预处理：把内置范文的拆解结果提前算好，随工程一起分发。
 *
 * ## 为什么必须做这件事
 *
 * 2026-10-30 用户看到魔搭上**每一篇范文都显示"没能拆出招式"**——因为部署环境
 * 没有配模型环境变量，`config.llmReady` 为 false，于是全部走降级路径。
 * 根子上的问题不是"忘了配变量"，是**把产品的核心价值押在了一个外部服务上**：
 * 它会慢（实测一次拆解 32-65 秒）、会没配额、会在演示现场不在线。
 * 用它保证不了"孩子点开一篇范文就能看到招"。
 *
 * 而内置的 79 篇范文是**已知且固定**的——没有理由在运行时才算。
 * 提前算好并随库分发，于是：
 *   1. 点开内置范文立刻有招，不依赖模型在不在线
 *   2. 演示现场不可能失败
 *   3. 粘贴任意一篇仍然走实时 agent，产品故事不变
 *
 * ## 诚实性
 *
 * 预处理**不是换一套松一点的逻辑**：走的还是 `buildAnalysis` 同一个入口，
 * 包括引用逐字校验和自纠错重试。存下来的是它当时真正返回并通过校验的结果，
 * 连 `attempts`（自纠错用了几轮）一起存——那是"agent 真的在改错"的证据。
 * 界面上会明确区分"这一篇提前算好的"和"这次当场拆的"，不混为一体。
 *
 * ## 用法
 *
 *   node --no-warnings scripts/precompute-analysis.mjs            # 两种变体都算
 *   node --no-warnings scripts/precompute-analysis.mjs --base     # 只算基础变体
 *   node --no-warnings scripts/precompute-analysis.mjs --force    # 不算过的也重算
 *
 * 已经算过的篇目默认跳过，所以中断之后可以直接重跑续上。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const essayDir = path.join(root, '..', 'client', 'src', 'data', 'essays');
const outDir = path.join(root, 'data', 'precomputed');

const GRADES = [3, 4, 5, 6];

/**
 * 两种变体。为什么是两种：`collectedCount` 会改变 prompt——册子里攒够 3 招之后，
 * 支架撤除生效，模型少标几招并额外给一个 `challenge`（让孩子自己找的那一句）。
 * 只存基础变体的话，内置范文就永远走不到支架撤除，那个创新点在主路径上消失了。
 */
const VARIANTS = [
  { key: 'base', collectedCount: 0, label: '基础（册子空）' },
  { key: 'scaffolded', collectedCount: 3, label: '支架撤除（册子 3 招）' },
];

const args = process.argv.slice(2);
const onlyBase = args.includes('--base');
const force = args.includes('--force');
const CONCURRENCY = 6;

const { buildAnalysis } = await import('../src/agent/analyze.js');
const { isValidAnalysis } = await import('../src/agent/analyze.js');

/** 读某个年级的范文。只取 status=verified 的——和前端检索层同一口径。 */
function loadEssays(grade) {
  const file = path.join(essayDir, `grade-${grade}.json`);
  const list = JSON.parse(readFileSync(file, 'utf8'));
  return (list.essays ?? []).filter((essay) => essay.status === 'verified');
}

function loadExisting(grade) {
  const file = path.join(outDir, `grade-${grade}.json`);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * 复核仓里已有的条目，剔掉不合格的。
 *
 * 为什么需要：2026-10-30 发现 6 篇存进去的段落文本**不是逐字原文**——
 * 模型没严格照抄，而当时的入库闸门没查这一项。服务端读取时的那道复核
 * 正确拦下了它们（没给孩子看错内容），但结果是这些篇目掉进实时链路，
 * 孩子要等 60-90 秒。**存的时候不严，读的时候就只能慢。**
 *
 * 所以加载时就按当前标准重验一遍，不合格的当场丢掉、等重跑补上。
 * 这样"提高校验标准"之后不需要手动清理旧数据，重跑一次自动修好。
 *
 * @param {Object} store 该年级已有的仓
 * @param {Array} essays 该年级的范文（用来拿原文）
 */
function pruneInvalid(store, essays) {
  const byId = new Map(essays.map((essay) => [essay.id, essay]));
  let dropped = 0;

  for (const [essayId, entry] of Object.entries(store)) {
    const essay = byId.get(essayId);
    // 仓里有这一年级已经不存在的 id：旧数据，丢掉
    if (!essay) {
      delete store[essayId];
      dropped += 1;
      continue;
    }
    for (const variant of ['base', 'scaffolded']) {
      const item = entry[variant];
      if (!item) continue;
      const problem = isValidAnalysis(item.analysis, essay.text);
      if (problem) {
        delete entry[variant];
        dropped += 1;
      }
    }
    if (!entry.base && !entry.scaffolded) delete store[essayId];
  }

  if (dropped > 0) {
    console.log(`  复核已有条目：剔除 ${dropped} 个不合格的，重跑会补上`);
  }
  return store;
}

function save(grade, store) {
  writeFileSync(path.join(outDir, `grade-${grade}.json`), `${JSON.stringify(store, null, 1)}\n`, 'utf-8');
}

/**
 * 额度/配额耗尽的特征。命中就**整轮中止**，不再往下打。
 *
 * 2026-10-30 实测：额度用到一半返回 402 quota_exceeded，而脚本没有这道闸，
 * 于是它拿剩下的 83 个任务各打了两次，166 次请求全部 402，跑了 15 分钟
 * 才发现。既浪费时间，也可能让账号进入更难看的状态。
 * 这类错误不是"这一篇失败"，是"接下来每一篇都会失败"。
 */
const FATAL = /quota|billing|insufficient|余额|欠费|402/i;

/** 命中致命错误后置位，并发池每次取新任务前都看它一眼。 */
let fatalReason = '';

/** 跑一篇的一个变体。失败不抛出：记下来，让这一篇留空，后续重跑再补。 */
async function runOne(essay, variant) {
  let result;
  try {
    result = await buildAnalysis({
      grade: essay.grade,
      essayText: essay.text,
      topic: essay.topic,
      collectedCount: variant.collectedCount,
      // 绕过预处理仓。没有这一句，--force 重算时会读到仓里已有的那份，
      // 等于什么都没重算——而这个脚本的全部意义就是真去调一次模型。
      forceLive: true,
    });
  } catch (error) {
    // buildAnalysis 自己会吞掉调用失败走降级，能抛到这里的是意外。
    // 但要防额度耗尽：那种情况下 degraded 也是 true，会被当成普通失败记下来，
    // 然后继续打下一篇。所以在这里先认一次。
    if (FATAL.test(error.message)) {
      fatalReason = error.message;
      throw new Error(`__FATAL__${error.message}`);
    }
    return { ok: false, why: error.message };
  }

  if (result.crisis) return { ok: false, why: '命中危机规则' };
  if (result.degraded) {
    // 降级原因要分类处置。**不能再拿 `attempts === 0` 猜**——那个值在
    // "两次都没通过校验"时同样是 0，2026-10-30 就这样把普通校验失败
    // 当成额度耗尽，整轮误中止，白扔了 5 篇能算完的。
    const reason = result.degradeReason ?? 'unknown';
    const fatal = reason === 'quota_exceeded' || reason === 'llm_not_configured';
    const label = {
      quota_exceeded: '额度耗尽（402）',
      llm_not_configured: '没有配置模型 Key',
      timeout: '调用超时',
      upstream_unreachable: '上游连不上',
      invalid_output: '两次都没通过逐字校验',
      unknown: '原因不明',
    }[reason] ?? reason;
    return { ok: false, why: `${label}，重跑同一命令可续`, fatal };
  }

  // 再独立校验一次。buildAnalysis 内部已经校验过（不过就自纠错），
  // 这里是入库前最后一道闸——存进去的东西必须是能直接渲染的。
  const problem = isValidAnalysis(result.analysis, essay.text);
  if (problem) return { ok: false, why: `校验不过: ${problem}` };

  return {
    ok: true,
    entry: {
      analysis: result.analysis,
      basis: result.basis,
      attempts: result.attempts,
      // 预处理的时间戳。写进产出物是让"这是什么时候算的"可查——
      // 换了模型或改了 prompt，旧结果就该重算，没有时间戳就无从判断。
      computedAt: new Date().toISOString(),
      model: process.env.LLM_MODEL ?? '',
    },
  };
}

/** 简易并发池。模型调用是纯 IO 等待，4 路并发不会互相干扰。 */
async function pool(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

mkdirSync(outDir, { recursive: true });

let done = 0;
let failed = 0;
const startedAt = Date.now();

for (const grade of GRADES) {
  const essays = loadEssays(grade);
  const variants = onlyBase ? VARIANTS.slice(0, 1) : VARIANTS;
  // 先按当前标准复核已有条目，不合格的丢掉后会被算进"待算"
  const store = pruneInvalid(loadExisting(grade), essays);

  const jobs = [];
  for (const essay of essays) {
    for (const variant of variants) {
      const already = store[essay.id]?.[variant.key];
      if (already && !force) continue;
      jobs.push({ essay, variant });
    }
  }

  if (jobs.length === 0) {
    console.log(`${grade} 年级：${essays.length} 篇全部已算过，跳过`);
    continue;
  }

  console.log(`${grade} 年级：${essays.length} 篇，待算 ${jobs.length} 个（${variants.map((v) => v.key).join(' + ')}）`);

  await pool(jobs, async ({ essay, variant }) => {
    // 额度耗尽就整体停手，不再打无效请求
    if (fatalReason) return;

    const tag = `${grade}/${essay.id}/${variant.key}`;
    const beganAt = Date.now();
    try {
      const outcome = await runOne(essay, variant);
      if (outcome.ok) {
        store[essay.id] = store[essay.id] ?? {};
        store[essay.id][variant.key] = outcome.entry;
        done += 1;
        const secs = ((Date.now() - beganAt) / 1000).toFixed(0);
        console.log(`  ok   ${tag}  ${secs}s  自纠错 ${outcome.entry.attempts} 轮  ${outcome.entry.analysis.moves.length} 招`);
      } else {
        failed += 1;
        console.log(`  FAIL ${tag}  ${outcome.why}`);
        if (outcome.fatal) fatalReason = outcome.why;
      }
    } catch (error) {
      if (String(error.message).startsWith('__FATAL__')) {
        fatalReason = error.message.slice('__FATAL__'.length);
        console.log(`  STOP ${tag}  额度或配额耗尽，整轮中止：${fatalReason}`);
      } else {
        failed += 1;
        console.log(`  ERR  ${tag}  ${error.message}`);
      }
    }
    // 每完成一个就落盘：中断不丢进度，长任务最怕的是跑了一小时全没了
    save(grade, store);
  });

  if (fatalReason) {
    console.log(`\n!! 整轮中止：${fatalReason}`);
    console.log('   已算过的都已落盘。额度恢复后重跑同一命令即可续上。');
    break;
  }
}

const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
console.log(`\n完成 ${done} 个，失败 ${failed} 个，用时 ${minutes} 分钟`);
console.log(`产出目录：${outDir}`);

if (failed > 0) {
  console.log('有失败的，重跑同一命令即可续上（已算过的会跳过）。');
  process.exit(1);
}
