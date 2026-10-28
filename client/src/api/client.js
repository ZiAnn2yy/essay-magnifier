/**
 * 前端唯一的网络出口。
 *
 * 规范§〇红线二：Key 不下前端。这里只打自家 /api/*，
 * 不出现任何模型平台地址、不出现任何凭证。
 */

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message ?? `请求失败（${response.status}）`);
  }
  return data;
}

export function createLearner() {
  return request('/learner', { method: 'POST' });
}

export function sendChat({ learnerId, sessionId, text }) {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({ learnerId, sessionId, text }),
  });
}

export function checkHealth() {
  return request('/health');
}
