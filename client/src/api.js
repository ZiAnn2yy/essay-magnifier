/**
 * 前端唯一的网络出口。
 *
 * 恢复自 git 历史 `4b333f4:client/src/api/client.js` 的形状：统一前缀、
 * 统一判 `ok`、失败抛带中文消息的 Error。旧实现随旧页面一起下架了，
 * 但"前端必须自己处理失败"这件事没过期——当前界面零错误提示，
 * 模型慢一拍用户就以为程序死了。
 *
 * **不收集身份。** 原先这里有 getLearnerId / ensureLearner 两个函数，
 * 打一个 /api/learner 端点建档、把 id 存 localStorage——那条路由早已删除，
 * 这两个函数是死的，2026-11-01 删掉。产品立场是不收集姓名学校
 * （规范§四.5）：要统计行为就只计数，见 lib/track.js。
 */

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error('连不上服务，检查一下网络再试');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.message ?? `请求失败（${response.status}）`);
  }
  return data;
}

export function checkAccess() {
  return request('/access');
}

export function unlock(code) {
  return request('/access', { method: 'POST', body: JSON.stringify({ code }) });
}

/**
 * 拆解一篇范文。
 *
 * 2026-10-30 修掉一个静默丢字段的 bug：这里原先只解构
 * `{ grade, title, essayText }`，而 Analyzer 传进来的 `collectedCount`
 * 在解构那一刻就被丢掉了，请求体里从来没有它。服务端收到 undefined、
 * 按 0 处理，于是**支架撤除从来没生效过**——册子攒到十招，拆解还是照旧
 * 全标好，PPT 上写的那个创新点在真实链路里是死的。
 * 教训：中间层转发的字段要和服务端契约一一对上，丢字段不报错，
 * 它只是让功能安静地不存在。
 *
 * `essayId` 只有内置范文有。带上它才可能命中预处理结果（提前算好的拆解），
 * 于是点开内置范文**不依赖模型在不在线**；粘贴的范文不带，走实时 agent。
 *
 * `collectedCount` 和 `writtenEssays` 是支架撤除的两半依据，服务端**两个都过线**
 * 才撤。判据和为什么是合取见 `server/src/agent/fading.js`。
 */
export function analyzeEssay({
  grade,
  title,
  topic,
  essayId,
  essayText,
  collectedCount,
  writtenEssays,
}) {
  return request('/v3/analyze', {
    method: 'POST',
    body: JSON.stringify({ grade, title, topic, essayId, essayText, collectedCount, writtenEssays }),
  });
}

/**
 * 让孩子写的那两句给"读者"看。
 *
 * 走 /api/v3/reader，**不是** /api/chat：那条链路的人格是"学伴"，
 * 底色是苏格拉底提问加双环推理，实测会在孩子写完一句后回一篇带编号的写作课。
 * 这里要的是一个刚读完他句子的人，只说自己读到了什么。
 */
export function askReader({ moveName, essayTitle, childText }) {
  return request('/v3/reader', {
    method: 'POST',
    body: JSON.stringify({ moveName, essayTitle, childText }),
  });
}

/**
 * 追问：孩子读完回信接着问，读者当场答。
 *
 * 走 /api/v3/follow-up，**不是**再打一次 /api/v3/reader：追问要带上下文
 * （他原来写的那句、读者原来的回信）才能接得上话，那是另一个契约。
 * 同一封信里可以追问很多次，每次都是一次独立调用——不写会话，
 * 上下文由调用方每次带全。
 */
export function askFollowUp({ moveName, essayTitle, mySentence, reply, question }) {
  return request('/v3/follow-up', {
    method: 'POST',
    body: JSON.stringify({ moveName, essayTitle, mySentence, reply, question }),
  });
}
