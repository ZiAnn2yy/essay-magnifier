/**
 * 错误类型与响应构造。
 *
 * 只保留一个关键概念：这条消息能不能给前端看。
 * 规范§四.3 要求不泄露内部细节（堆栈、上游原文），
 * 所以默认不外泄，只有显式标注 safe 的才透出。
 */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.safe = true;
  }
}

export function errorResponse(error) {
  if (error instanceof ValidationError) {
    return { status: 400, body: { ok: false, code: 'invalid_request', message: error.message } };
  }

  return {
    status: 500,
    body: { ok: false, code: 'internal_error', message: '服务内部错误，请稍后重试' },
  };
}
