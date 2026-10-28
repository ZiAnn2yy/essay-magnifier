// 命中这些关键字的字段在日志里一律打码。
// 规范§〇红线二要求 Key 不下前端；日志同样属于可能外泄的通道，必须一并防住。
const SECRET_KEY_PATTERN = /apikey|api_key|authorization|token|secret|password|credential/i;

function mask(value) {
  if (typeof value !== 'string' || value.length === 0) return '***';
  // 只留长度信息，足够判断"是不是空配置"，又不足以还原内容
  return `***<len:${value.length}>`;
}

function redact(value, depth = 0) {
  if (depth > 4) return '[深度超限]';
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SECRET_KEY_PATTERN.test(key) ? mask(item) : redact(item, depth + 1);
  }
  return result;
}

function emit(level, message, detail) {
  const time = new Date().toISOString();
  const suffix = detail === undefined ? '' : ` ${JSON.stringify(redact(detail))}`;
  const line = `${time} [${level}] ${message}${suffix}`;
  // 错误走 stderr，其余走 stdout，方便部署时分开收集
  if (level === 'ERROR') console.error(line);
  else console.log(line);
}

export const logger = {
  info: (message, detail) => emit('INFO', message, detail),
  warn: (message, detail) => emit('WARN', message, detail),
  error: (message, detail) => emit('ERROR', message, detail),
  debug: (message, detail) => emit('DEBUG', message, detail),
};
