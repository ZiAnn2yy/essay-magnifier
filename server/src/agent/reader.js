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
import { buildReaderPrompt, buildFollowUpPrompt } from './prompts/index.js';
import { detectCrisis, CRISIS_REPLY } from '../safety/crisis-rules.js';

/** 读者不需要长篇：三四句话。但推理模型会先吃掉一批 token，仍按 8192 给。 */
const READER_MAX_TOKENS = 8192;

/**
 * 读者回应的超时预算。
 *
 * 与拆解同因，且分布更宽：实测同一个任务跑 6 次，
 * 4.2s / 9.3s / 30.6s / 31.4s / 40.8s / 60s+（超时），中位数就在 31 秒。
 * 输出只有一百来字，耗时全花在推理上，**没有理由比拆解短**。
 *
 * 2026-10-30 之前这里没有覆盖，吃的是全局 LLM_TIMEOUT_MS。
 * 而 model/client.js 的注释一直写着"调用方可以按任务覆盖：拆解要 30-50 秒，
 * 读者回应只要几秒"——后半句是猜的，代码里也从来没有这个覆盖。
 * 结果是评测 online-002 长期被记成"temperature=1 偶发失败，重跑即可"，
 * 真因是稳定超时：按 30 秒算，上述 6 次里有 3 次会被砍。
 *
 * 给到 90 秒，与 ANALYZER_TIMEOUT_MS 同档：覆盖实测长尾，也留余量。
 * 超时不重试那条在 model/client.js，两边配合才有效。
 */
export const READER_TIMEOUT_MS = 90000;

/** 模型不可用时的兜底。不编造"读者感受"——那是假的，孩子会识破。 */
const FALLBACK_REPLY =
  '我现在没办法好好读你写的东西（模型没有连上）。你写的这句先留着，晚点再给读者看。';

/** 额度耗尽时的兜底。和"没配 Key"分开说——这两种故障的处置完全不同。 */
const QUOTA_REPLY =
  '模型今天的额度用完了，所以我读不了你写的句子。你写的这句先存在这儿，额度回来了再看。';

/**
 * 追问得不到回答时的兜底。
 *
 * 不说"模型没有连上"那种内部故障——对孩子来说事情很简单：
 * 他问了一句，没人接上。让他知道可以再问一次，别以为是自己的问题。
 */
const FOLLOW_UP_FALLBACK = '这个问题我没接上。你再问一遍，或者换个问法试试。';

/**
 * 上游故障分类。判据是错误消息里的特征串——上游没有给结构化错误码，
 * 这是唯一可用的信号。与 analyze.js 的分类口径保持一致。
 *
 * 为什么值得分：超时是环境事件、额度是账户事件、upstream 是别的问题，
 * 三者的处置完全不同。评测要能只说"这次不算"，就得先分得开。
 */
function classifyFailure(error) {
  if (!error) return 'unconfigured';
  const message = String(error.message ?? '');
  if (/超时|timeout|abort/i.test(message)) return 'timeout';
  if (/429|budget|quota|rate limit/i.test(message)) return 'quota';
  return 'upstream';
}

/** 按故障类型取兜底话术。不编造"读者感受"——那是假的，孩子会识破。 */
function fallbackFor(error) {
  const reason = classifyFailure(error);
  const isQuota = reason === 'quota';
  return { reply: isQuota ? QUOTA_REPLY : FALLBACK_REPLY, quota: isQuota, reason };
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
        timeoutMs: READER_TIMEOUT_MS,
      });

      const reply = String(message?.content ?? '').trim();
      if (reply.length > 0) {
        return { crisis: false, reply, degraded: false };
      }
      throw new Error('读者回应为空');
    } catch (error) {
      logger.warn('LLM 读者回应失败，使用兜底话术', { reason: error.message });
      const fallback = fallbackFor(error);
      return {
        crisis: false,
        reply: fallback.reply,
        degraded: true,
        quota: fallback.quota,
        reason: fallback.reason,
      };
    }
  }

  const fallback = fallbackFor(null);
  return { crisis: false, reply: fallback.reply, degraded: true, quota: false, reason: 'unconfigured' };
}

/**
 * 追问：孩子读完回信，接着问读者一个问题。
 *
 * 2026-11-02 加。用户要的是"读者回信了之后，小朋友可以继续追问读者，展开话题，
 * 鼓励写作"——他问一句、读者答一句，话就续上了；而为了接着问，
 * 他得先想清楚自己想问什么，那一下就是在想。
 *
 * 和 buildReaderReply 的分工：那一问一答是"这一句写得怎么样"，
 * 这一问一答是"关于它我还想聊"。**同一封信里可以追问很多次**，
 * 每次都是一次独立调用，不写会话——上下文由调用方把原句和原回信带进来。
 *
 * 即刻回信：答案就地回到那一封里，不长等、不另起一封信。超时预算和读者
 * 回应同一档（实测中位数 31 秒、长尾过 60），追问输出更短，但不该因此
 * 砍预算——砍了孩子等来一句"我没接上"。
 */
export async function buildFollowUpReply({ moveName, essayTitle, mySentence, reply, question }) {
  const crisis = detectCrisis(question);
  if (crisis.level === 'crisis') {
    logger.warn('追问命中危机规则，返回固定引导话术', { matched: crisis.matched });
    return { crisis: true, reply: CRISIS_REPLY, degraded: false };
  }

  if (config.llmReady) {
    try {
      const message = await chatCompletion({
        messages: [
          { role: 'system', content: buildFollowUpPrompt() },
          {
            role: 'user',
            content: JSON.stringify({
              move: moveName,
              fromEssay: essayTitle,
              wrote: mySentence,
              youReplied: reply,
              heAsks: question,
            }),
          },
        ],
        maxTokens: READER_MAX_TOKENS,
        timeoutMs: READER_TIMEOUT_MS,
      });

      const answer = String(message?.content ?? '').trim();
      if (answer.length > 0) {
        return { crisis: false, reply: answer, degraded: false };
      }
      throw new Error('追问回应为空');
    } catch (error) {
      logger.warn('LLM 追问回应失败，使用兜底话术', { reason: error.message });
      const fallback = fallbackFor(error);
      return {
        crisis: false,
        // 追问的兜底和回信的兜底不是一句：那是"你写的先留着"，
        // 这是"我没接上你的问题"，说错了孩子不知道该不该再问
        reply: fallback.quota ? fallback.reply : FOLLOW_UP_FALLBACK,
        degraded: true,
        quota: fallback.quota,
        reason: fallback.reason,
      };
    }
  }

  const fallback = fallbackFor(null);
  return {
    crisis: false,
    reply: fallback.quota ? fallback.reply : FOLLOW_UP_FALLBACK,
    degraded: true,
    quota: fallback.quota,
    reason: 'unconfigured',
  };
}
