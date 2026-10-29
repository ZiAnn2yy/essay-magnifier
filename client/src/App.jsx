import { useCallback, useEffect, useState } from 'react';
import './styles/app.css';
import Gate from './components/Gate.jsx';
import StartScreen from './components/StartScreen.jsx';
import StageGate from './components/StageGate.jsx';
import Analyzer from './components/Analyzer.jsx';
import { checkAccess, unlock } from './api.js';

/**
 * 范文放大镜。
 *
 * 节拍像游戏开局，不像表单：**开始 → 选年级 → 选范文 → 拆解 → 写一招**。
 * 第一屏只放一个按钮——孩子打开时看到表格或说明就会认定"这是作业"，
 * 看到一个大按钮才会想按。选年级单独占一拍，是因为拆解深度按年级分叉，
 * 这一步是产品在做判断，不是收集信息。
 *
 * 没有路由库，页面靠 state 三元切——五屏的产品引一个 router 是净成本。
 * `?grade=3..6` 是录屏和评审用的深链，跳过前两拍，不改变产品流程。
 */
const MIN_GRADE = 3;
const MAX_GRADE = 6;

function initialGrade() {
  const raw = new URLSearchParams(window.location.search).get('grade');
  const grade = Number(raw);
  return Number.isInteger(grade) && grade >= MIN_GRADE && grade <= MAX_GRADE ? grade : null;
}

export default function App() {
  // null = 还在问服务端要不要密码。这时候别渲染主界面，
  // 否则会在门槛后面闪一下内容——门槛必须是第一眼看到的东西。
  const [access, setAccess] = useState(null);
  const [started, setStarted] = useState(() => initialGrade() !== null);
  const [grade, setGrade] = useState(initialGrade);

  const ask = useCallback(() => {
    checkAccess()
      .then(setAccess)
      .catch(() => setAccess({ required: false, unlocked: false, unreachable: true }));
  }, []);

  useEffect(() => {
    ask();
  }, [ask]);

  if (access === null) {
    return (
      <main className="boot">
        <p>在问服务要不要密码…</p>
      </main>
    );
  }

  if (access.unreachable) {
    return (
      <main className="boot">
        <p className="boot-title">连不上服务</p>
        <p className="boot-hint">前端跑起来了，但后端没有应答。检查服务是否启动。</p>
        <button type="button" className="boot-retry" onClick={ask}>
          再试一次
        </button>
      </main>
    );
  }

  if (access.required && !access.unlocked) {
    return (
      <Gate
        onUnlocked={async (code) => {
          await unlock(code);
          setAccess({ required: true, unlocked: true });
        }}
      />
    );
  }

  if (!started) {
    return <StartScreen onStart={() => setStarted(true)} />;
  }

  if (grade === null) {
    return <StageGate onPick={setGrade} />;
  }

  return <Analyzer grade={grade} onBack={() => setGrade(null)} />;
}
