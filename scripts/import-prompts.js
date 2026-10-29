#!/usr/bin/env node
/**
 * 作文题库导入：CSV → client/src/data/prompts.json
 *
 * 为什么是 CSV 而不是 xlsx：教师用 Excel 填，另存为 CSV 即可；
 * 读 xlsx 要装 SheetJS，为一个构建期脚本引依赖不划算。零依赖还有个好处——
 * 换台机器照样能跑。
 *
 * 用法：
 *   node scripts/import-prompts.js <csv路径>              # 合并（按 年级+题目 更新/新增）
 *   node scripts/import-prompts.js <csv路径> --replace    # 全量替换（CSV 里没有的一律删掉）
 *   node scripts/import-prompts.js --template             # 生成一张带表头的空模板
 *
 * 退出码 0 = 成功；1 = 有错误且未写入（不会生成半份题库）。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BANK_PATH = resolve(HERE, '../client/src/data/prompts.json');

const COLUMNS = [
  'grade',
  'title',
  'form',
  'type',
  'source',
  'sourceDetail',
  'status',
  'hints',
  'keywords',
  'payoff',
  'note',
];

const REQUIRED = ['grade', 'title', 'form', 'type', 'source', 'sourceDetail', 'status'];

const ENUMS = {
  form: ['dahua', 'xizuo'],
  type: ['person', 'scene', 'object', 'event', 'imagine', 'practical'],
  source: ['textbook', 'exam', 'ningxia'],
  status: ['verified', 'draft'],
  payoff: ['picturebook', 'comic', 'animation'],
};

const BAND_OF_GRADE = { 1: 'lower', 2: 'lower', 3: 'lower', 4: 'upper', 5: 'upper', 6: 'upper' };

const errors = [];
const warnings = [];

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/* ---------------------------------------------------------------- CSV 解析 */

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/* ---------------------------------------------------------------- 读取与校验 */

function readCsv(filePath) {
  let buffer;
  try {
    buffer = readFileSync(filePath);
  } catch (error) {
    fail(`读不到文件：${filePath}\n  ${error.message}`);
  }

  let text = buffer.toString('utf8');

  // 中文 Windows 上 Excel 默认存 GBK。GBK 字节按 UTF-8 解会出 U+FFFD，
  // 这里必须拦住——静默生成一份乱码题库比报错难发现得多。
  if (text.includes('�')) {
    fail(
      'CSV 不是有效的 UTF-8（检测到乱码符）。\n' +
        '  请在 Excel 里另存为，选「CSV UTF-8（逗号分隔）」，不要选「CSV（逗号分隔）」。',
    );
  }

  // Excel 存 UTF-8 会带 BOM，不剥掉第一列的列名会变成 "﻿grade"
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = parseCsv(text);
  if (rows.length < 2) fail('CSV 里没有数据行（只有表头或完全为空）。');

  const header = rows[0].map((cell) => cell.trim());
  const missing = REQUIRED.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    fail(`CSV 缺少必需列：${missing.join('、')}\n  表头必须是：${COLUMNS.join(', ')}`);
  }

  const extra = header.filter((column) => !COLUMNS.includes(column));
  if (extra.length > 0) {
    warnings.push(`CSV 里有不认识的列，已忽略：${extra.join('、')}`);
  }

  return rows.slice(1).map((cells, index) => {
    const record = {};
    header.forEach((column, columnIndex) => {
      if (COLUMNS.includes(column)) record[column] = (cells[columnIndex] ?? '').trim();
    });
    return { line: index + 2, record };
  });
}

function validateRow({ line, record }) {
  const where = `第 ${line} 行`;

  for (const column of REQUIRED) {
    if (!record[column]) errors.push(`${where}：必填列 \`${column}\` 是空的`);
  }

  const grade = Number(record.grade);
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
    errors.push(`${where}：\`grade\` 必须是 1-6 的整数，现在是 "${record.grade}"`);
  }

  for (const [column, allowed] of Object.entries(ENUMS)) {
    const value = record[column];
    if (value && !allowed.includes(value)) {
      errors.push(`${where}：\`${column}\` 只能是 ${allowed.join(' / ')}，现在是 "${value}"`);
    }
  }

  if (record.payoff === '') delete record.payoff;

  // 红线：出处里不得出现学校、学生、教师信息
  const banned = /小学|中学|学校|学院|老师|教师|导师|同学/;
  if (banned.test(record.sourceDetail ?? '')) {
    errors.push(
      `${where}：\`sourceDetail\` 触犯了作品零个人信息红线（出现了 "${record.sourceDetail}"）。\n` +
        '     只能写到教材单元、地区、年份。详见 docs/作文题库-字段说明.md 第五节。',
    );
  }

  // ningxia 是本组自编题，不得冒充教材或考题
  if (record.source === 'ningxia' && record.status === 'verified') {
    warnings.push(
      `${where}：\`source=ningxia\` 却标了 \`verified\`。家乡题材是本组起草、非考试题，建议先标 \`draft\`。`,
    );
  }

  return { grade, record };
}

/* ---------------------------------------------------------------- 主流程 */

function buildPrompt(grade, record, existing) {
  const splitList = (value) =>
    (value ?? '')
      .split('|')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

  const prompt = {
    // 有同题旧记录就沿用它的 id，保证前端缓存/收藏不失效
    id: existing?.id ?? `p-${grade}-${BAND_OF_GRADE[grade]}-${String(record.title.length).padStart(2, '0')}${hashTitle(record.title)}`,
    grade,
    band: BAND_OF_GRADE[grade],
    title: record.title,
    form: record.form,
    type: record.type,
    source: record.source,
    sourceDetail: record.sourceDetail,
    status: record.status,
    hints: splitList(record.hints),
    keywords: splitList(record.keywords),
  };

  if (record.payoff) prompt.payoff = record.payoff;
  if (record.note) prompt.note = record.note;

  return prompt;
}

/** 让同题不同源也能分出稳定 id。不追求无碰撞，追求可复现。 */
function hashTitle(title) {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.codePointAt(i)) % 100000;
  }
  return String(hash).padStart(5, '0');
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--template')) {
    const template = `${COLUMNS.join(',')}\n4,推荐一个好地方,xizuo,scene,textbook,部编版四年级上册 第一单元习作,verified,这个地方在哪儿|它有什么特别之处|你最想让别人知道什么,五颜六色|生机勃勃,picturebook,\n`;
    writeFileSync(resolve(process.cwd(), 'prompts-template.csv'), template, 'utf8');
    console.log('✓ 已生成 prompts-template.csv，用 Excel 打开填完再导入。');
    return;
  }

  const replace = args.includes('--replace');
  const filePath = args.find((arg) => !arg.startsWith('--'));
  if (!filePath) {
    fail('缺少 CSV 路径。\n  用法：node scripts/import-prompts.js <csv路径> [--replace]');
  }

  const rows = readCsv(resolve(process.cwd(), filePath));
  const parsed = rows.map(validateRow);

  if (errors.length > 0) {
    console.error(`\n✗ 发现 ${errors.length} 个错误，未写入任何文件：\n`);
    for (const error of errors) console.error(`  · ${error}`);
    console.error('');
    process.exit(1);
  }

  let bank;
  try {
    bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
  } catch (error) {
    fail(`读不到题库文件：${BANK_PATH}\n  ${error.message}`);
  }

  const existingList = Array.isArray(bank.prompts) ? bank.prompts : [];
  // 同年级同题目视为同一条，避免重复导入堆出重复题
  const indexByKey = new Map(existingList.map((prompt) => [keyOf(prompt), prompt]));

  let added = 0;
  let updated = 0;

  for (const { grade, record } of parsed) {
    const key = keyOf({ grade, title: record.title });
    const existing = indexByKey.get(key);
    if (existing) updated += 1;
    else added += 1;
    indexByKey.set(key, buildPrompt(grade, record, existing));
  }

  const nextPrompts = replace
    ? [...indexByKey.values()]
    : [...indexByKey.values()].sort(
        (a, b) => a.grade - b.grade || a.title.localeCompare(b.title, 'zh'),
      );

  bank.prompts = nextPrompts;
  bank.version = new Date().toISOString().slice(0, 10);

  writeFileSync(BANK_PATH, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');

  const verified = nextPrompts.filter((prompt) => prompt.status === 'verified').length;
  console.log(`\n✓ 导入完成 → ${BANK_PATH}`);
  console.log(`  新增 ${added} 条，更新 ${updated} 条，共 ${nextPrompts.length} 条（其中可显示 ${verified} 条）`);
  if (replace) console.log('  本次为 --replace 全量替换，CSV 里没有的条目已删除。');
  if (warnings.length > 0) {
    console.log(`\n  ${warnings.length} 条提醒：`);
    for (const warning of warnings) console.log(`  · ${warning}`);
  }
  console.log('');
}

function keyOf({ grade, title }) {
  return `${grade}::${title}`;
}

main();
