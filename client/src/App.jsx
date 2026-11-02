import { useCallback, useEffect, useState } from 'react';
import './styles/app.css';
import Gate from './components/Gate.jsx';
import StartScreen from './components/StartScreen.jsx';
import StageGate from './components/StageGate.jsx';
import Analyzer from './components/Analyzer.jsx';
import { checkAccess, unlock } from './api.js';
import { track } from './lib/track.js';

// 动效常开，不跟随系统的"减少动态效果"偏好。
// 用户 2026-10-29 明确要求：动效是这个产品的内容（落贴纸、发牌、那句飞进
// 作文本全是反馈本身），不是装饰，所以不能因为系统设置就整体关掉。
// 曾做过一个听系统的开关，但那个开关在"只是顺手关掉 Windows 动画效果"的
// 机器上会让产品看起来是坏的——用户实际遇到的就是这个。
// 各处的 html.motion-off 规则保留着，作为无障碍的退路：
// 真需要的时候在 <html> 上加一个 class 就能整体静音，不必回去改每一处。
document.documentElement.classList.add('motion-on');

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
      .then((result) => {
        setAccess(result);
        // 进到开始屏才算一个会话真正开始。**要密码时这里不记**——
        // 门槛都没过的连接不计入漏斗，而服务端对没过门槛的会话一律 401，
        // 在这儿发只会得到一条永远不落地的请求加一个控制台报错。
        // 部署版是带密码的，所以那一条要等真的输对了再发（见下面 Gate 的 onUnlocked）。
        if (!result.required) track('enter', {});
      })
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
          // 漏斗第一步落在这儿，不是 checkAccess 那儿——见 ask() 里的说明
          track('enter', {});
        }}
      />
    );
  }

  if (!started) {
    return (
      <StartScreen
        onStart={() => {
          track('start', {});
          setStarted(true);
        }}
      />
    );
  }

  if (grade === null) {
    return <StageGate onPick={setGrade} />;
  }

  return <Analyzer grade={grade} onBack={() => setGrade(null)} />;
}
