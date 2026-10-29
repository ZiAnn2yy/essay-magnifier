import { ValidationError } from './errors.js';

/**
 * 校验一段用户文本。
 *
 * 规范§四.2：外部输入一律当不可信数据。超长**直接拒绝而不是截断**——
 * 截断会改变原意（一篇被砍掉一半的范文，拆出来的东西是错的），
 * 比拒绝更糟。
 *
 * @param {unknown} value 待校验值
 * @param {string} fieldName 字段名，用于错误消息
 * @param {number} maxLength 长度上限
 * @returns {string} 去掉首尾空白后的文本
 */
export function validateText(value, fieldName, maxLength) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} 必须是字符串`);
  }

  const text = value.trim();
  if (text.length === 0) {
    throw new ValidationError(`${fieldName} 不能为空`);
  }
  if (text.length > maxLength) {
    throw new ValidationError(`${fieldName} 过长，最多 ${maxLength} 字`);
  }
  return text;
}
