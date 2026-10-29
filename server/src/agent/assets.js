/**
 * 绘本素材库的权威清单。
 *
 * 激励功能（作文 → 绘本放映）不押注生图 API（JoyCode Key 已实测无生图能力），
 * 路线是「预制素材 + LLM 导演」：素材离线生产，LLM 只负责读作文、
 * 为每一格挑一张素材——它只能引用本清单里的 id，禁止虚构。
 *
 * 本文件是单一事实源：
 *   - 导演提示词从这里生成素材目录（给 LLM 看）
 *   - 本地降级匹配从这里取关键词（LLM 不可用时的兜底）
 *   - scripts/make-canvas-assets.mjs 从这里取 id 生成 SVG 文件
 *
 * 素材图片本身在 client/public/canvas/{id}.svg，由生成脚本产出，
 * 随前端构建产物一起被 server 静态托管，不涉及任何密钥。
 */

/**
 * @typedef {Object} CanvasAsset
 * @property {string} id       素材编号，同时是 SVG 文件名
 * @property {string} label    给 LLM 看的画面说明
 * @property {string[]} keywords 本地降级匹配用的中文关键词
 */

/** @type {CanvasAsset[]} */
export const CANVAS_ASSETS = [
  // ── 自然 ──────────────────────────────────────────────
  { id: 'sun', label: '太阳，笑容一样的光芒', keywords: ['太阳', '阳光', '晴', '暖', '光'] },
  { id: 'moon', label: '月亮，安静的夜', keywords: ['月亮', '夜', '晚上', '夜空'] },
  { id: 'star', label: '星星，一闪一闪', keywords: ['星星', '星光', '满天'] },
  { id: 'cloud', label: '云朵，慢悠悠地飘', keywords: ['云', '天空', '天上'] },
  { id: 'rain', label: '下雨了，一滴一滴', keywords: ['雨', '下雨', '淋'] },
  { id: 'rainbow', label: '彩虹，雨后的惊喜', keywords: ['彩虹', '雨后'] },
  { id: 'snow', label: '下雪了，白白的一片', keywords: ['雪', '冬天', '白色'] },
  { id: 'mountain', label: '大山，远远的轮廓', keywords: ['山', '山坡', '山脚', '远'] },
  { id: 'river', label: '小河，哗哗地流', keywords: ['河', '小溪', '溪', '流水'] },
  { id: 'sea', label: '大海，蓝色的大浪', keywords: ['海', '大海', '海浪', '沙滩', '浪'] },
  { id: 'tree', label: '一棵大树，绿绿的树冠', keywords: ['树', '森林', '大树', '叶子'] },
  { id: 'flower', label: '一朵花，开得正好', keywords: ['花', '花朵', '花园', '香'] },

  // ── 场所 ──────────────────────────────────────────────
  { id: 'house', label: '小房子，家的样子', keywords: ['房', '家', '院子', '门口', '门'] },
  { id: 'school', label: '学校，上课的地方', keywords: ['学校', '教室', '上课', '老师', '课'] },
  { id: 'field', label: '田野，绿油油的庄稼', keywords: ['田', '田野', '庄稼', '地里', '稻'] },
  { id: 'path', label: '一条小路，弯弯地伸远', keywords: ['路', '小路', '路上', '走路'] },
  { id: 'kitchen', label: '厨房，饭菜的香味', keywords: ['厨房', '做饭', '饭', '菜', '锅'] },
  { id: 'workshop', label: '木头工坊，工具和木屑', keywords: ['工坊', '木头', '木', '工具', '做'] },

  // ── 人物 ──────────────────────────────────────────────
  { id: 'kid', label: '一个小孩，好奇的眼睛', keywords: ['小孩', '孩子'] },
  { id: 'grandpa', label: '爷爷，笑眯眯的', keywords: ['爷爷', '外公'] },
  { id: 'grandma', label: '奶奶，慈祥的', keywords: ['奶奶', '外婆'] },
  { id: 'mother', label: '妈妈，温柔的', keywords: ['妈妈', '母亲'] },
  { id: 'father', label: '爸爸，高高的', keywords: ['爸爸', '父亲'] },
  { id: 'friend', label: '好朋友，一起玩', keywords: ['朋友', '同学', '伙伴', '一起'] },

  // ── 动物 ──────────────────────────────────────────────
  { id: 'cat', label: '一只小猫，眯着眼', keywords: ['猫'] },
  { id: 'dog', label: '一只小狗，摇尾巴', keywords: ['狗'] },
  { id: 'bird', label: '一只小鸟，站在枝头', keywords: ['鸟', '燕子', '麻雀'] },
  { id: 'fish', label: '一条小鱼，游来游去', keywords: ['鱼', '金鱼', '游'] },
  { id: 'rabbit', label: '小白兔，长长的耳朵', keywords: ['兔'] },
  { id: 'butterfly', label: '蝴蝶，翩翩地飞', keywords: ['蝴蝶', '飞'] },
  { id: 'cow', label: '老牛，慢慢嚼草', keywords: ['牛'] },
  { id: 'chicken', label: '小鸡，毛茸茸的', keywords: ['鸡', '鸡叫', '母鸡'] },

  // ── 物件 ──────────────────────────────────────────────
  { id: 'book', label: '一本摊开的书', keywords: ['书', '读', '故事'] },
  { id: 'pencil', label: '铅笔，写下心事', keywords: ['铅笔', '笔', '写', '字'] },
  { id: 'kite', label: '风筝，飞得很高', keywords: ['风筝', '高'] },
  { id: 'bicycle', label: '自行车，轮子转呀转', keywords: ['自行车', '骑车', '车'] },
  { id: 'cake', label: '蛋糕，甜甜的', keywords: ['蛋糕', '生日', '甜'] },
  { id: 'lamp', label: '一盏灯，暖暖的光', keywords: ['灯', '台灯', '光'] },
  { id: 'cup', label: '一杯热茶，冒着热气', keywords: ['茶', '杯', '热气'] },

  // ── 心情意象 ──────────────────────────────────────────
  { id: 'heart', label: '一颗心，装着喜欢', keywords: ['爱', '喜欢', '开心', '高兴', '心里'] },
  { id: 'gift', label: '一份礼物，等着被打开', keywords: ['礼物', '惊喜'] },
  { id: 'music', label: '音符，飘在空气里', keywords: ['歌', '唱', '音乐', '琴', '声'] },
];

/** id → 素材的索引。校验 LLM 输出时用，避免每次 find */ 
export const ASSET_INDEX = new Map(CANVAS_ASSETS.map((asset) => [asset.id, asset]));

/** LLM 都不合适时的最终兜底：谁都能配上的一格 */
export const FALLBACK_ASSET_ID = 'star';

/**
 * 生成给 LLM 看的素材目录文本。
 * 刻意保持紧凑——目录越长，模型越容易挑花眼。
 */
export function assetCatalogText() {
  return CANVAS_ASSETS.map((asset) => `- ${asset.id}：${asset.label}`).join('\n');
}