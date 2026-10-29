/**
 * 读者回应：孩子用一招写完自己的之后，一个"刚读完的人"回应他。
 *
 * 为什么不用 /api/chat：那条链路的人格是**学伴**，底色是苏格拉底提问 +
 * 双环推理 + 引用溯源，是讲课的口吻。实测它在孩子写完一句之后
 * 回了一篇带编号和加粗的写作课。而这里要的是荣维东说的"真实读者"——
 * 产品对外说"有真实读者"，就不能让孩子收到一份课件。
 *
 * 所以它是独立的一次调用、独立的人格，与学伴、拆解并列三个出口。
 *
 * 危机路径与拆解一致：孩子写的那几句同样可能是求助信号，
 * 规则拥有结论就必须拥有回应的确定性。
 */

import { config } from '../config.js';
import { chatCompletion } from '../model/client.js';
import { logger } from '../lib/logger.js';
import { buildReaderPrompt } from './prompts/index.js';
import { detectCrisis, CRISIS_REPLY } from '../safety/crisis-rules.js';

/** 读者不需要长篇：三四句话。但推理模型会先吃掉一批 token，仍按 8192 给。 */
const READER_MAX_TOKENS = 8192;

/** 模型不可用时的兜底。不编造"读者感受"——那是假的，孩子会识破。 */
const FALLBACK_REPLY =
  '我现在没办法好好读你写的东西（模型没有连上）。你写的这句先留着，晚点再给读者看。';

/** 额度耗尽时的兜底。和"没配 Key"分开说——这两种故障的处置完全不同。 */
const QUOTA_REPLY =
  '模型今天的额度用完了，所以我读不了你写的句子。你写的这句先存在这儿，额度回来了再看。';

/** 上游是限流/额度问题时的兜底话术。判据是错误里带 429 或 budget。 */
function fallbackFor(error) {
  const message = String(error?.message ?? '');
  const isQuota = message.includes('429') || /budget|quota|rate limit/i.test(message);
  return { reply: isQuota ? QUOTA_REPLY : FALLBACK_REPLY, quota: isQuota };
}

export async function buildReaderReply({ moveName, essayTitle, childText }) {
  const crisis = detectCrisis(childText);
  if (crisis.level === 'crisis') {
    logger.warn('孩子写的句子命中危机规则，返回固定引导话术', { matched: crisis.matched });
    return { crisis: true, reply: CRISIS_REPLY, degraded: false };
  }

  if (config.llmReady) {
    try {
      const message = await chatCompletion({
        messages: [
          { role: 'system', content: buildReaderPrompt() },
          {
            role: 'user',
            content: JSON.stringify({ move: moveName, fromEssay: essayTitle, wrote: childText }),
          },
        ],
        maxTokens: READER_MAX_TOKENS,
      });

      const reply = String(message?.content ?? '').trim();
      if (reply.length > 0) {
        return { crisis: false, reply, degraded: false };
      }
      throw new Error('读者回应为空');
    } catch (error) {
      logger.warn('LLM 读者回应失败，使用兜底话术', { reason: error.message });
      const fallback = fallbackFor(error);
      return { crisis: false, reply: fallback.reply, degraded: true, quota: fallback.quota };
    }
  }

  const fallback = fallbackFor(null);
  return { crisis: false, reply: fallback.reply, degraded: true, quota: false };
}
