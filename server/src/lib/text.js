/**
 * 文本层面的确定性工具。
 *
 * 单独一个文件而不是塞在 agent 里：**拆解校验和预处理复核都要用它**。
 * 塞在 agent/analyze.js 里的话，预处理仓为了 import 它会和 analyze 形成环
 * （analyze 要调预处理仓），ESM 能扛住那种环但读起来是个坑。
 */

/**
 * 去掉所有空白后判断 sub 是否逐字出自 text。
 *
 * 为什么要去空白：粘贴的范文换行和空格位置不稳定，模型照抄时也可能微调，
 * 逐个字符卡死会把"格式差异"误判成"编造"。去掉空白后仍然要求
 * **每一个字都对得上**——换一个词、加一个意思，照样过不了。
 *
 * @param {unknown} sub 待校验的引用
 * @param {unknown} text 原文
 * @returns {boolean}
 */
export function isVerbatimSubstring(sub, text) {
  if (typeof sub !== 'string' || sub.length === 0) return false;
  if (typeof text !== 'string') return false;
  return text.replace(/\s+/g, '').includes(sub.replace(/\s+/g, ''));
}
