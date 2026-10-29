import bank from './prompts.json';

/**
 * 作文题库的检索层。
 *
 * 三条规则，改动前先读：
 *
 * 1. **只暴露 `status: 'verified'` 的题目。** `draft` 是"还没经教师确认"的
 *    草稿，产品里一律不出现。宁可题库空着让调用方走降级，也不把没核对过的
 *    题目当教材推给孩子——这是项目规范里"事实性内容必须给出处"的直接落地。
 *
 * 2. **返回的是副本，不是内部引用。** 调用方改返回值不能污染题库。
 *
 * 3. **题库为空不是错误。** 题库内容要靠教师提供（见
 *    `docs/作文题库-字段说明.md`），在灌进来之前这里就是空的，
 *    调用方必须处理空数组，不能假设一定有题。
 */

const ALL_PROMPTS = Array.isArray(bank.prompts) ? bank.prompts : [];

const BANDS = bank.bands ?? {};
const SOURCES = bank.sources ?? {};

/** 学段带 → 年级数组。顺序即界面上的顺序。 */
export function getBands() {
  return Object.entries(BANDS).map(([id, band]) => ({
    id,
    label: band.label,
    grades: [...band.grades],
    note: band.note ?? '',
  }));
}

/** 某个学段带覆盖哪些年级。 */
export function getGradesInBand(bandId) {
  return BANDS[bandId] ? [...BANDS[bandId].grades] : [];
}

/**
 * 取一个学段带下所有可给学生的题目，按年级、再按题型排。
 *
 * @param {string} bandId 'lower' | 'upper'
 * @returns {Array} 已过滤 draft；题库为空时返回空数组
 */
export function getPromptsByBand(bandId) {
  const grades = new Set(getGradesInBand(bandId));

  return ALL_PROMPTS.filter(
    (prompt) =>
      prompt.status === 'verified' &&
      grades.has(prompt.grade) &&
      typeof prompt.title === 'string' &&
      prompt.title.length > 0,
  )
    .map((prompt) => ({ ...prompt }))
    .sort((a, b) => a.grade - b.grade || String(a.type).localeCompare(String(b.type)));
}

/** 按年级取。 */
export function getPromptsByGrade(grade) {
  return ALL_PROMPTS.filter((prompt) => prompt.status === 'verified' && prompt.grade === grade).map(
    (prompt) => ({ ...prompt }),
  );
}

/** 按 id 取单条，找不到返回 null。 */
export function getPromptById(id) {
  const found = ALL_PROMPTS.find((prompt) => prompt.id === id);
  return found ? { ...found } : null;
}

/**
 * 出处的可读文案。产品里要对家长出示"这题出自哪儿"，
 * 所以 `source` 这种机器值必须能翻成人话。
 */
export function describeSource(prompt) {
  if (!prompt) return '';
  const label = SOURCES[prompt.source] ?? prompt.source ?? '';
  const detail = prompt.sourceDetail ?? '';
  return detail.length > 0 ? `${label} · ${detail}` : label;
}

/** 题库统计，给"题库里有几题"这类提示用。 */
export function getBankStats() {
  const verified = ALL_PROMPTS.filter((prompt) => prompt.status === 'verified');
  const byBand = {};

  for (const band of getBands()) {
    byBand[band.id] = verified.filter((prompt) => band.grades.includes(prompt.grade)).length;
  }

  return {
    total: ALL_PROMPTS.length,
    verified: verified.length,
    draft: ALL_PROMPTS.length - verified.length,
    byBand,
  };
}
