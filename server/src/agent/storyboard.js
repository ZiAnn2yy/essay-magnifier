/**
 * 绘本导演：把孩子的作文变成一份分镜（每格配一张素材）。
 *
 * 两条路：
 *   1. LLM 导演——prompt 约束模型只输出 JSON 分镜，一次往返拿到结构化结果。
 *      （曾用 tool_choice 强制工具调用，但当前推理模型的 thinking 模式
 *      不兼容 tool_choice specified，故改为 JSON 文本往返 + 稳健解析。）
 *   2. 本地降级——LLM 不可用、超时或返回不合法时，按素材 keywords 逐格匹配。
 *
 * 激励功能的成立性不押在 LLM 上：任何失败最终都会得到一份合法分镜，
 * 放映页永远有图可放，演示现场不会转圈。
 */

import { config } from '../config.js';
import { chatCompletion } from '../model/client.js';
import { logger } from '../lib/logger.js';
import { buildDirectorPrompt } from './prompts/index.js';
import {
  CANVAS_ASSETS,
  ASSET_INDEX,
  FALLBACK_ASSET_ID,
  assetCatalogText,
} from './assets.js';

/**
 * 从模型回复中提取 JSON。
 * 先整体 parse；失败则截取首个 { 到末个 } 之间的子串再试——
 * 模型偶尔会用 ```json 围栏或带一句寒暄，截取能兜住大多数情况。
 */
function parseJsonLoose(text) {
  const trimmed = String(text ?? '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** 检查 LLM 返回的分镜是否合法：assetId 都在目录里、frameId 恰好覆盖全部格子 */
function isValidStoryboard(storyboard, frameIds) {
  if (!storyboard || typeof storyboard.tone !== 'string' || !Array.isArray(storyboard.panels)) {
    return false;
  }
  const seen = new Set();
  if (storyboard.panels.length !== frameIds.size) return false;
  return storyboard.panels.every((panel) => {
    if (!ASSET_INDEX.has(panel?.assetId)) return false;
    if (!frameIds.has(panel?.frameId) || seen.has(panel.frameId)) return false;
    seen.add(panel.frameId);
    return true;
  });
}

/** 组装 LLM 调用消息：句子作为 JSON 数据传入，不拼进指令区（规范§四.2） */
function buildDirectorMessages({ grade, filmTitle, frames }) {
  const payload = JSON.stringify({
    grade,
    filmTitle,
    frames: frames.map((frame) => ({ id: frame.id, text: frame.text })),
  });
  return [
    { role: 'system', content: buildDirectorPrompt(assetCatalogText()) },
    { role: 'user', content: payload },
  ];
}

/**
 * 导演的 max_tokens。
 *
 * 必须远大于"答案本身需要的长度"（分镜 JSON 约 140 字），因为当前可用的
 * 模型全是**推理模型**：实测 kimi-k2.6 在 2048 预算下 reasoning_tokens
 * 吃掉 2047，正文 0 字、finish_reason=length，上层只能降级。
 * 8192 是实测能稳定吐出完整 JSON 的值（ reasoning 约 4500 + 正文约 140）。
 */
const DIRECTOR_MAX_TOKENS = 8192;

/** LLM 导演。成功返回 storyboard；任何失败都抛出，由上层走降级 */
async function directStoryboard(request) {
  const message = await chatCompletion({
    messages: buildDirectorMessages(request),
    maxTokens: DIRECTOR_MAX_TOKENS,
  });

  const storyboard = parseJsonLoose(message?.content);
  if (!storyboard) throw new Error('导演返回的内容无法解析为 JSON');

  const frameIds = new Set(request.frames.map((frame) => frame.id));
  if (!isValidStoryboard(storyboard, frameIds)) {
    throw new Error(`导演返回的分镜不合法: ${JSON.stringify(storyboard).slice(0, 300)}`);
  }
  return storyboard;
}

/**
 * 本地降级：为每格挑第一张 keywords 命中的素材。
 * 匹配是子串包含，从前往后扫——目录顺序即优先级（自然类靠前，
 * 因为低年级作文写景多）。谁都不中就 star，保证每格有图。
 */
function matchAsset(text) {
  for (const asset of CANVAS_ASSETS) {
    if (asset.keywords.some((keyword) => text.includes(keyword))) {
      return asset.id;
    }
  }
  return FALLBACK_ASSET_ID;
}

export function localStoryboard({ frames }) {
  return {
    tone: '轻快地',
    panels: frames.map((frame) => ({
      frameId: frame.id,
      assetId: matchAsset(frame.text),
    })),
  };
}

/**
 * 导演入口。llmReady 且 LLM 路径成功 → { storyboard, degraded: false }；
 * 否则本地匹配 → { storyboard: localStoryboard(...), degraded: true }。
 */
export async function buildStoryboard(request) {
  if (config.llmReady) {
    try {
      const storyboard = await directStoryboard(request);
      return { storyboard, degraded: false };
    } catch (error) {
      // 降级不是异常：记 warn 即可，孩子的放映照常进行
      logger.warn('LLM 导演失败，使用本地匹配', { reason: error.message });
    }
  }
  return { storyboard: localStoryboard(request), degraded: true };
}