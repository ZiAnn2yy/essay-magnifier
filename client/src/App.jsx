import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { createLearner, sendChat } from './api/client.js';

const STORAGE_KEY = 'edu-agent.learnerId';

/**
 * 功能性外壳。
 *
 * 规范§六：任何界面改动必须先过 oil-ui skill，不允许凭感觉定配色字体。
 * 所以本文件刻意只保证"能发消息、能看到回复"，不含任何视觉决策——
 * 内联样式只是为了让骨架可读，视觉方向待 oil-ui 出三套对比后整体替换。
 */
export default function App() {
  const [learnerId, setLearnerId] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  // 首次进入自动建档。规范§〇红线一：不向用户索取姓名、学校等任何个人信息。
  useEffect(() => {
    if (learnerId) return undefined;

    let cancelled = false;
    createLearner()
      .then((data) => {
        if (cancelled) return;
        localStorage.setItem(STORAGE_KEY, data.learnerId);
        setLearnerId(data.learnerId);
      })
      .catch(() => {
        if (!cancelled) setError('初始化失败，请刷新重试');
      });

    return () => {
      cancelled = true;
    };
  }, [learnerId]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (text.length === 0 || isSending) return;

    setIsSending(true);
    setError('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setDraft('');

    try {
      const data = await sendChat({ learnerId, sessionId, text });
      setSessionId(data.sessionId);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.text, degraded: data.degraded },
      ]);
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setIsSending(false);
    }
  }, [draft, isSending, learnerId, sessionId]);

  return (
    <main style={styles.page}>
      <h1 style={styles.title}>学习学伴</h1>

      <div style={styles.transcript}>
        {messages.length === 0 && (
          <p style={styles.placeholder}>说点什么吧，我陪你看看。</p>
        )}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            style={message.role === 'user' ? styles.userRow : styles.assistantRow}
          >
            {/* 用 react-markdown 渲染，天然转义 HTML；全项目禁用 dangerouslySetInnerHTML */}
            <ReactMarkdown>{message.text}</ReactMarkdown>
          </div>
        ))}
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.composer}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="把不懂的地方说出来…"
          rows={3}
          style={styles.input}
          disabled={isSending}
        />
        <button type="button" onClick={handleSend} disabled={isSending} style={styles.button}>
          {isSending ? '在想…' : '发送'}
        </button>
      </div>
    </main>
  );
}

const styles = {
  page: { maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' },
  title: { fontSize: 20, marginBottom: 16 },
  transcript: { minHeight: 240, display: 'flex', flexDirection: 'column', gap: 12 },
  placeholder: { color: '#888' },
  userRow: { alignSelf: 'flex-end', background: '#f0f0f0', padding: '8px 12px', borderRadius: 8 },
  assistantRow: { alignSelf: 'flex-start', padding: '8px 12px' },
  error: { color: '#b00' },
  composer: { display: 'flex', gap: 8, marginTop: 16, alignItems: 'flex-end' },
  input: { flex: 1, padding: 8, fontFamily: 'inherit', resize: 'vertical' },
  button: { padding: '10px 16px', cursor: 'pointer' },
};
