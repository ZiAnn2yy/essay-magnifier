/**
 * 工具注册表与分发。
 *
 * 规范§五：工具名用 snake_case，描述写清"什么时候该调、什么时候不该调"，
 * 参数逐个说明含义。
 *
 * 与 dogdog 的差异：那里 executeTool 同步且无异常边界，单个工具抛错会带崩整轮循环。
 * 这里逐个工具 try/catch，错误作为 tool 结果回填，让模型知道工具失败了、
 * 并自己决定怎么跟学习者说。
 */

/**
 * 检索学科知识库。
 *
 * ⚠️ 骨架期占位：知识卡片内容待与指导教师沟通后建立（M4）。
 * 先把它返回"未命中"，让工具链路的形状先跑通。
 */
async function lookupKnowledge(args) {
  const query = typeof args?.query === 'string' ? args.query.trim() : '';
  if (query.length === 0) {
    return { found: false, error: 'query 不能为空' };
  }

  return {
    found: false,
    note: '知识库尚未建立，本次无依据可引。',
  };
}

export const tools = [
  {
    name: 'lookup_knowledge',
    description:
      '检索学科知识库，用于获取知识点讲解、公式、例题与可引用的教材位置。' +
      '当学习者的问题涉及事实性知识、或你需要给出处时调用。' +
      '当学习者只是在表达情绪、或纯粹是解题思路讨论而不涉及事实内容时，不要调用。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '要检索的知识点或问题，用学习者提到的原词',
        },
        knowledge_point: {
          type: 'string',
          description: '可选。归类用的知识点标识，便于后续统计掌握度',
        },
      },
      required: ['query'],
    },
    handler: lookupKnowledge,
  },
];

/** 发给上游的工具定义：只保留协议字段，handler 是本地实现不能外传 */
export function toWireFormat() {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export async function executeTool(name, args) {
  const tool = tools.find((item) => item.name === name);
  if (!tool) {
    return { ok: false, error: `未知工具: ${name}` };
  }

  try {
    const result = await tool.handler(args);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: `工具执行失败: ${error.message}` };
  }
}
