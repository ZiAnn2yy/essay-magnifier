import { useCallback, useState } from 'react';
import './styles/app.css';
import StageGate from './components/StageGate.jsx';
import Workbench from './components/Workbench.jsx';

/**
 * 入口：选年级 → 胶卷工作台。
 *
 * 选到"年级"而不是"学段带"：挑词的开关在三年级（课标把"有新鲜感的词句"
 * 放在第二学段 3-4 年级），而学段带是 1-3 / 4-6，三年级落在低段里。
 * 只选段定不了行为，必须选到年级。见 data/writingBands.js。
 *
 * `?grade=` 是录屏和评审用的深链，不改变产品流程，只是跳过入口。
 */
function initialGrade() {
  const raw = new URLSearchParams(window.location.search).get('grade');
  const grade = Number(raw);
  return Number.isInteger(grade) && grade >= 1 && grade <= 6 ? grade : null;
}

export default function App() {
  const [grade, setGrade] = useState(initialGrade);

  if (grade === null) {
    return <StageGate onPick={setGrade} />;
  }

  return <Workbench grade={grade} onGradeChange={setGrade} />;
}
