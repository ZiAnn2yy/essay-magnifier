import { ValidationError } from './errors.js';

// learnerId 只接受服务端生成的 UUID 形态，避免把用户输入直接当标识符用
const LEARNER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateLearnerId(value) {
  if (typeof value !== 'string' || !LEARNER_ID_PATTERN.test(value)) {
    throw new ValidationError('learnerId 格式不正确');
  }
  return value;
}

/**
 * 校验对话文本。
 *
 * 规范§四.2：用户输入必须限长与清洗。超长直接拒绝而不是截断——
 * 截断会改变学习者原意，比拒绝更糟。
 */
export function validateText(value, maxLength) {
  if (typeof value !== 'string') {
    throw new ValidationError('text 必须是字符串');
  }

  const text = value.trim();
  if (text.length === 0) {
    throw new ValidationError('输入内容为空');
  }
  if (text.length > maxLength) {
    throw new ValidationError(`输入过长，最多 ${maxLength} 字`);
  }
  return text;
}
