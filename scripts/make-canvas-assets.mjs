#!/usr/bin/env node
/**
 * 生成绘本素材 SVG：45 张蜡笔风小画，输出到 client/public/canvas/{id}.svg。
 *
 * 素材清单的唯一事实源是 server/src/agent/assets.js——本脚本只负责"怎么画"。
 * 画面风格刻意保持儿童蜡笔画形状：粗描边、圆角、大色块、简单几何，
 * 与导演 prompt 承诺的"蜡笔绘本风"一致。
 *
 * 用法：node scripts/make-canvas-assets.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANVAS_ASSETS } from '../server/src/agent/assets.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(ROOT, '../client/public/canvas');

const STROKE = '#6D4C41'; // 蜡笔棕描边，全部素材统一
const SW = 7;

function svgWrap(body, bg) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">',
    `  <rect x="6" y="6" width="228" height="228" rx="28" fill="${bg}"/>`,
    `  <g stroke="${STROKE}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round">`,
    body,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

/* ---------- 小工具：程序化生成重复元素 ---------- */

/** 从圆心向外的一圈短射线（太阳光芒） */
function rays(cx, cy, r1, r2, n) {
  return Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x1 = Math.round(cx + Math.cos(a) * r1);
    const y1 = Math.round(cy + Math.sin(a) * r1);
    const x2 = Math.round(cx + Math.cos(a) * r2);
    const y2 = Math.round(cy + Math.sin(a) * r2);
    return `    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('\n');
}

/** 五角星路径 */
function starPath(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / 5 - Math.PI / 2;
    pts.push(`${Math.round(cx + Math.cos(a) * r)},${Math.round(cy + Math.sin(a) * r)}`);
  }
  return pts.join(' ');
}

/** 绕圆心一圈的花瓣 */
function petals(cx, cy, dist, r, n) {
  return Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x = Math.round(cx + Math.cos(a) * dist);
    const y = Math.round(cy + Math.sin(a) * dist);
    return `    <circle cx="${x}" cy="${y}" r="${r}" fill="#F48FB1"/>`;
  }).join('\n');
}

/** 笑脸：眼睛两点 + 微笑弧线 */
function face(cx, cy, eyeDy = -8) {
  const ex = 16;
  return [
    `    <circle cx="${cx - ex}" cy="${cy + eyeDy}" r="5" fill="${STROKE}" stroke="none"/>`,
    `    <circle cx="${cx + ex}" cy="${cy + eyeDy}" r="5" fill="${STROKE}" stroke="none"/>`,
    `    <path d="M ${cx - 12} ${cy + 14} Q ${cx} ${cy + 26} ${cx + 12} ${cy + 14}" fill="none"/>`,
  ].join('\n');
}

/* ---------- 每张素材的绘制定义 ---------- */

const DRAWINGS = {
  // ── 自然 ──
  sun: {
    bg: '#FFF8E1',
    body: `    <circle cx="120" cy="120" r="52" fill="#FFD54F"/>\n${rays(120, 120, 66, 88, 8)}`,
  },
  moon: {
    bg: '#E8EAF6',
    body: '    <path d="M150 45 A 78 78 0 1 0 150 195 A 62 62 0 1 1 150 45 Z" fill="#FFF59D"/>\n    <circle cx="170" cy="70" r="5" fill="#FFF59D"/>\n    <circle cx="185" cy="95" r="5" fill="#FFF59D"/>',
  },
  star: {
    bg: '#FFFDE7',
    body: `    <polygon points="${starPath(120, 115, 68, 28)}" fill="#FFE082"/>\n${rays(120, 115, 78, 96, 4)}`,
  },
  cloud: {
    bg: '#E1F5FE',
    body: '    <circle cx="90" cy="118" r="36" fill="#E3F2FD"/>\n    <circle cx="140" cy="105" r="42" fill="#E3F2FD"/>\n    <circle cx="172" cy="128" r="30" fill="#E3F2FD"/>\n    <rect x="66" y="120" width="130" height="38" rx="19" fill="#E3F2FD"/>',
  },
  rain: {
    bg: '#ECEFF1',
    body: '    <circle cx="90" cy="80" r="28" fill="#E3F2FD"/>\n    <circle cx="130" cy="70" r="34" fill="#E3F2FD"/>\n    <circle cx="160" cy="90" r="24" fill="#E3F2FD"/>\n    <line x1="80" y1="130" x2="70" y2="175" stroke="#64B5F6"/>\n    <line x1="115" y1="130" x2="105" y2="180" stroke="#64B5F6"/>\n    <line x1="150" y1="130" x2="140" y2="175" stroke="#64B5F6"/>\n    <line x1="180" y1="125" x2="170" y2="165" stroke="#64B5F6"/>',
  },
  rainbow: {
    bg: '#F3E5F5',
    body: '    <path d="M40 180 A 80 80 0 0 1 200 180" fill="none" stroke="#E57373" stroke-width="12"/>\n    <path d="M56 180 A 64 64 0 0 1 184 180" fill="none" stroke="#FFB74D" stroke-width="12"/>\n    <path d="M72 180 A 48 48 0 0 1 168 180" fill="none" stroke="#FFF176" stroke-width="12"/>\n    <path d="M88 180 A 32 32 0 0 1 152 180" fill="none" stroke="#81C784" stroke-width="12"/>\n    <line x1="30" y1="180" x2="210" y2="180"/>',
  },
  snow: {
    bg: '#E3F2FD',
    body: '    <circle cx="90" cy="75" r="26" fill="#ECEFF1"/>\n    <circle cx="128" cy="66" r="32" fill="#ECEFF1"/>\n    <circle cx="158" cy="84" r="22" fill="#ECEFF1"/>\n    <line x1="80" y1="140" x2="110" y2="170" stroke="#90CAF9"/>\n    <line x1="110" y1="140" x2="80" y2="170" stroke="#90CAF9"/>\n    <line x1="95" y1="155" x2="95" y2="155" stroke="#90CAF9"/>\n    <line x1="135" y1="145" x2="165" y2="175" stroke="#90CAF9"/>\n    <line x1="165" y1="145" x2="135" y2="175" stroke="#90CAF9"/>',
  },
  mountain: {
    bg: '#E0F2F1',
    body: '    <path d="M25 190 L100 70 L175 190 Z" fill="#A5D6A7"/>\n    <path d="M100 190 L160 100 L215 190 Z" fill="#81C784"/>\n    <path d="M83 104 L100 78 L117 104 Z" fill="#FAFAFA"/>\n    <path d="M148 128 L160 108 L172 128 Z" fill="#FAFAFA"/>\n    <line x1="25" y1="190" x2="215" y2="190"/>',
  },
  river: {
    bg: '#E8F5E9',
    body: '    <path d="M80 35 Q 100 60 80 85 T 80 135 Q 100 160 80 185" fill="none" stroke="#64B5F6" stroke-width="14"/>\n    <path d="M150 35 Q 130 60 150 85 T 150 135 Q 130 160 150 185" fill="none" stroke="#64B5F6" stroke-width="14"/>\n    <path d="M115 45 Q 125 65 115 85 T 115 130" fill="none" stroke="#90CAF9" stroke-width="10"/>',
  },
  sea: {
    bg: '#E1F5FE',
    body: '    <circle cx="185" cy="55" r="26" fill="#FFE082"/>\n    <path d="M25 120 q 20 -16 40 0 t 40 0 t 40 0 t 40 0 t 40 0" fill="none" stroke="#4FC3F7" stroke-width="12"/>\n    <path d="M25 160 q 20 -16 40 0 t 40 0 t 40 0 t 40 0 t 40 0" fill="none" stroke="#4FC3F7" stroke-width="12"/>\n    <path d="M25 195 q 20 -16 40 0 t 40 0 t 40 0 t 40 0 t 40 0" fill="none" stroke="#4FC3F7" stroke-width="12"/>',
  },
  tree: {
    bg: '#F1F8E9',
    body: '    <rect x="106" y="140" width="28" height="60" fill="#BCAAA4"/>\n    <circle cx="120" cy="95" r="52" fill="#A5D6A7"/>\n    <circle cx="80" cy="128" r="28" fill="#A5D6A7"/>\n    <circle cx="160" cy="128" r="28" fill="#A5D6A7"/>\n    <line x1="30" y1="200" x2="210" y2="200"/>',
  },
  flower: {
    bg: '#FCE4EC',
    body: `    <line x1="120" y1="130" x2="120" y2="205" stroke="#81C784"/>\n    <path d="M120 170 Q 90 160 82 178 Q 105 188 120 178" fill="#A5D6A7"/>\n${petals(120, 105, 42, 24, 6)}\n    <circle cx="120" cy="105" r="22" fill="#FFE082"/>`,
  },

  // ── 场所 ──
  house: {
    bg: '#FFF3E0',
    body: '    <rect x="58" y="112" width="124" height="88" fill="#FFCCBC"/>\n    <path d="M48 112 L120 55 L192 112 Z" fill="#EF9A9A"/>\n    <rect x="104" y="150" width="32" height="50" fill="#8D6E63"/>\n    <rect x="74" y="130" width="22" height="22" fill="#FFF9C4"/>\n    <rect x="144" y="130" width="22" height="22" fill="#FFF9C4"/>',
  },
  school: {
    bg: '#FFFDE7',
    body: '    <rect x="68" y="105" width="104" height="95" fill="#FFE0B2"/>\n    <path d="M58 105 L120 55 L182 105 Z" fill="#90CAF9"/>\n    <line x1="120" y1="55" x2="120" y2="22"/>\n    <path d="M120 22 L155 31 L120 40 Z" fill="#EF5350"/>\n    <rect x="98" y="140" width="44" height="60" fill="#8D6E63"/>\n    <rect x="78" y="120" width="18" height="18" fill="#FFF9C4"/>\n    <rect x="144" y="120" width="18" height="18" fill="#FFF9C4"/>',
  },
  field: {
    bg: '#F1F8E9',
    body: '    <line x1="28" y1="95" x2="212" y2="95"/>\n    <path d="M70 190 q 10 -30 20 0" fill="#A5D6A7"/>\n    <path d="M115 175 q 10 -30 20 0" fill="#A5D6A7"/>\n    <path d="M160 195 q 10 -30 20 0" fill="#A5D6A7"/>\n    <circle cx="80" cy="155" r="6" fill="#FFB74D"/>\n    <circle cx="125" cy="140" r="6" fill="#FFB74D"/>\n    <circle cx="170" cy="160" r="6" fill="#FFB74D"/>',
  },
  path: {
    bg: '#E8F5E9',
    body: '    <path d="M45 205 Q 85 150 120 130 Q 160 108 195 55" fill="none" stroke="#D7CCC8" stroke-width="26"/>\n    <path d="M60 195 Q 95 150 125 132" fill="none" stroke="#FFF9C4" stroke-width="4" stroke-dasharray="2 14"/>\n    <path d="M75 60 q 10 -22 20 0" fill="#A5D6A7"/>\n    <path d="M155 170 q 10 -22 20 0" fill="#A5D6A7"/>',
  },
  kitchen: {
    bg: '#FFF3E0',
    body: '    <path d="M70 105 Q 62 85 70 68" fill="none" stroke="#B0BEC5"/>\n    <path d="M120 105 Q 112 85 120 68" fill="none" stroke="#B0BEC5"/>\n    <path d="M170 105 Q 162 85 170 68" fill="none" stroke="#B0BEC5"/>\n    <rect x="72" y="105" width="96" height="72" rx="12" fill="#FFAB91"/>\n    <line x1="55" y1="122" x2="72" y2="122"/>\n    <line x1="168" y1="122" x2="185" y2="122"/>\n    <rect x="72" y="148" width="96" height="12" fill="#FF8A65"/>',
  },
  workshop: {
    bg: '#EFEBE9',
    body: '    <rect x="40" y="150" width="118" height="44" rx="22" fill="#D7A86E"/>\n    <circle cx="158" cy="172" r="22" fill="#F3E2C7"/>\n    <circle cx="158" cy="172" r="8" fill="#D7A86E"/>\n    <rect x="120" y="70" width="66" height="26" rx="8" fill="#90A4AE"/>\n    <line x1="130" y1="96" x2="185" y2="140" stroke="#A1887F"/>',
  },

  // ── 人物（统一：圆头 + 笑脸 + 身体，发型区分角色）──
  kid: {
    bg: '#E3F2FD',
    body: `    <circle cx="120" cy="78" r="32" fill="#FFCC80"/>\n${face(120, 78)}\n    <path d="M88 118 Q120 108 152 118 L160 200 L80 200 Z" fill="#90CAF9"/>`,
  },
  grandpa: {
    bg: '#ECEFF1',
    body: `    <circle cx="120" cy="80" r="30" fill="#FFCC80"/>\n${face(120, 78)}\n    <path d="M98 92 Q120 118 142 92 Q120 100 98 92" fill="#ECEFF1"/>\n    <path d="M90 122 L150 122 L160 200 L80 200 Z" fill="#90A4AE"/>`,
  },
  grandma: {
    bg: '#FCE4EC',
    body: `    <circle cx="120" cy="80" r="30" fill="#FFCC80"/>\n    <circle cx="120" cy="50" r="15" fill="#ECEFF1"/>\n${face(120, 78)}\n    <path d="M90 122 Q120 112 150 122 L158 200 L82 200 Z" fill="#F48FB1"/>`,
  },
  mother: {
    bg: '#F3E5F5',
    body: `    <circle cx="120" cy="78" r="30" fill="#FFCC80"/>\n    <path d="M92 70 Q86 108 96 132" fill="none"/>\n    <path d="M148 70 Q154 108 144 132" fill="none"/>\n${face(120, 76)}\n    <path d="M92 120 Q120 112 148 120 L158 200 L82 200 Z" fill="#BA68C8"/>`,
  },
  father: {
    bg: '#E1F5FE',
    body: `    <circle cx="120" cy="68" r="28" fill="#FFCC80"/>\n${face(120, 66)}\n    <rect x="88" y="102" width="64" height="98" rx="10" fill="#5C6BC0"/>`,
  },
  friend: {
    bg: '#FFF8E1',
    body: `    <circle cx="85" cy="85" r="26" fill="#FFCC80"/>\n${face(85, 85)}\n    <path d="M62 116 Q85 108 108 116 L114 200 L56 200 Z" fill="#66BB6A"/>\n    <circle cx="155" cy="85" r="26" fill="#FFCC80"/>\n${face(155, 85)}\n    <path d="M132 116 Q155 108 178 116 L184 200 L126 200 Z" fill="#FF7043"/>\n    <line x1="108" y1="140" x2="132" y2="140"/>`,
  },

  // ── 动物 ──
  cat: {
    bg: '#FFF3E0',
    body: `    <path d="M85 75 L78 45 L105 62 Z" fill="#FFCC80"/>\n    <path d="M155 75 L162 45 L135 62 Z" fill="#FFCC80"/>\n    <circle cx="120" cy="105" r="48" fill="#FFCC80"/>\n    <circle cx="103" cy="98" r="5" fill="${STROKE}" stroke="none"/>\n    <circle cx="137" cy="98" r="5" fill="${STROKE}" stroke="none"/>\n    <path d="M114 115 L120 122 L126 115 Z" fill="#F48FB1" stroke="none"/>\n    <path d="M120 122 Q118 130 110 132" fill="none"/>\n    <path d="M120 122 Q122 130 130 132" fill="none"/>\n    <line x1="60" y1="108" x2="88" y2="110"/>\n    <line x1="60" y1="122" x2="88" y2="120"/>\n    <line x1="152" y1="110" x2="180" y2="108"/>\n    <line x1="152" y1="120" x2="180" y2="122"/>`,
  },
  dog: {
    bg: '#FBE9E7',
    body: `    <path d="M78 78 Q58 68 60 102 Q72 110 88 96 Z" fill="#A1887F"/>\n    <path d="M162 78 Q182 68 180 102 Q168 110 152 96 Z" fill="#A1887F"/>\n    <circle cx="120" cy="105" r="48" fill="#BCAAA4"/>\n    <circle cx="103" cy="95" r="5" fill="${STROKE}" stroke="none"/>\n    <circle cx="137" cy="95" r="5" fill="${STROKE}" stroke="none"/>\n    <ellipse cx="120" cy="125" rx="14" ry="10" fill="${STROKE}" stroke="none"/>\n    <path d="M120 135 Q118 145 110 145" fill="none"/>\n    <path d="M120 135 Q122 145 130 145" fill="none"/>`,
  },
  bird: {
    bg: '#E1F5FE',
    body: `    <circle cx="108" cy="125" r="42" fill="#FFF176"/>\n    <circle cx="150" cy="88" r="26" fill="#FFF176"/>\n    <path d="M172 88 L190 93 L172 98 Z" fill="#FFB74D"/>\n    <circle cx="156" cy="82" r="4" fill="${STROKE}" stroke="none"/>\n    <path d="M92 125 Q70 108 82 140 Q100 145 110 132" fill="#FFE082"/>\n    <path d="M102 165 L92 190 M122 165 L116 190"/>`,
  },
  fish: {
    bg: '#E0F7FA',
    body: `    <ellipse cx="108" cy="120" rx="52" ry="34" fill="#4FC3F7"/>\n    <path d="M155 120 L192 92 L186 120 L192 148 Z" fill="#29B6F6"/>\n    <circle cx="84" cy="112" r="5" fill="${STROKE}" stroke="none"/>\n    <path d="M110 88 Q118 98 110 106" fill="none"/>\n    <path d="M72 128 Q82 122 92 128" fill="none"/>`,
  },
  rabbit: {
    bg: '#F5F5F5',
    body: `    <ellipse cx="100" cy="65" rx="12" ry="32" fill="#FAFAFA"/>\n    <ellipse cx="140" cy="65" rx="12" ry="32" fill="#FAFAFA"/>\n    <circle cx="120" cy="118" r="44" fill="#FAFAFA"/>\n    <circle cx="105" cy="110" r="5" fill="${STROKE}" stroke="none"/>\n    <circle cx="135" cy="110" r="5" fill="${STROKE}" stroke="none"/>\n    <circle cx="120" cy="126" r="6" fill="#F48FB1" stroke="none"/>\n    <ellipse cx="120" cy="185" rx="38" ry="26" fill="#FAFAFA"/>`,
  },
  butterfly: {
    bg: '#F3E5F5',
    body: `    <ellipse cx="85" cy="100" rx="32" ry="26" fill="#CE93D8"/>\n    <ellipse cx="155" cy="100" rx="32" ry="26" fill="#CE93D8"/>\n    <ellipse cx="92" cy="145" rx="24" ry="20" fill="#F48FB1"/>\n    <ellipse cx="148" cy="145" rx="24" ry="20" fill="#F48FB1"/>\n    <line x1="120" y1="78" x2="120" y2="168"/>\n    <path d="M120 78 Q112 58 104 52" fill="none"/>\n    <path d="M120 78 Q128 58 136 52" fill="none"/>`,
  },
  cow: {
    bg: '#F1F8E9',
    body: `    <path d="M90 68 L82 44 L104 60 Z" fill="#A1887F"/>\n    <path d="M150 68 L158 44 L136 60 Z" fill="#A1887F"/>\n    <ellipse cx="98" cy="72" rx="14" ry="18" fill="#ECEFF1"/>\n    <ellipse cx="142" cy="72" rx="14" ry="18" fill="#ECEFF1"/>\n    <circle cx="120" cy="112" r="50" fill="#FAFAFA"/>\n    <ellipse cx="120" cy="142" rx="26" ry="18" fill="#FFCC80"/>\n    <circle cx="110" cy="140" r="4" fill="${STROKE}" stroke="none"/>\n    <circle cx="130" cy="140" r="4" fill="${STROKE}" stroke="none"/>\n    <circle cx="98" cy="102" r="5" fill="${STROKE}" stroke="none"/>\n    <circle cx="142" cy="102" r="5" fill="${STROKE}" stroke="none"/>\n    <circle cx="86" cy="128" r="8" fill="#A1887F"/>\n    <circle cx="156" cy="118" r="6" fill="#A1887F"/>`,
  },
  chicken: {
    bg: '#FFF8E1',
    body: `    <circle cx="120" cy="132" r="42" fill="#FFE082"/>\n    <circle cx="120" cy="86" r="28" fill="#FFE082"/>\n    <path d="M120 58 L108 50 L120 44 L132 50 Z" fill="#EF5350"/>\n    <path d="M146 88 L166 92 L146 96 Z" fill="#FF7043"/>\n    <circle cx="128" cy="80" r="4" fill="${STROKE}" stroke="none"/>\n    <path d="M108 172 L102 196 M132 172 L138 196"/>`,
  },

  // ── 物件 ──
  book: {
    bg: '#FFFDE7',
    body: `    <path d="M120 70 Q90 55 45 65 L45 175 Q90 165 120 180 Z" fill="#FFF9C4"/>\n    <path d="M120 70 Q150 55 195 65 L195 175 Q150 165 120 180 Z" fill="#FFF9C4"/>\n    <line x1="120" y1="70" x2="120" y2="180"/>\n    <line x1="60" y1="90" x2="105" y2="82"/>\n    <line x1="60" y1="108" x2="105" y2="100"/>\n    <line x1="60" y1="126" x2="100" y2="118"/>\n    <line x1="135" y1="82" x2="180" y2="90"/>\n    <line x1="135" y1="100" x2="180" y2="108"/>`,
  },
  pencil: {
    bg: '#FFF3E0',
    body: `    <rect x="95" y="60" width="50" height="110" fill="#FFCC80"/>\n    <path d="M95 170 L120 205 L145 170 Z" fill="#FFE0B2"/>\n    <path d="M110 188 L120 205 L130 188 Z" fill="${STROKE}"/>\n    <rect x="95" y="60" width="50" height="14" fill="#EF5350"/>\n    <rect x="95" y="74" width="50" height="8" fill="#B0BEC5"/>`,
  },
  kite: {
    bg: '#E1F5FE',
    body: `    <polygon points="120,40 170,110 120,150 70,110" fill="#81C784"/>\n    <line x1="120" y1="40" x2="120" y2="150"/>\n    <line x1="70" y1="110" x2="170" y2="110"/>\n    <path d="M120 150 Q135 170 120 185 Q105 200 125 215" fill="none"/>\n    <line x1="115" y1="175" x2="125" y2="170"/>\n    <line x1="118" y1="195" x2="128" y2="190"/>`,
  },
  bicycle: {
    bg: '#E8F5E9',
    body: `    <circle cx="70" cy="155" r="38" fill="none"/>\n    <circle cx="170" cy="155" r="38" fill="none"/>\n    <line x1="70" y1="155" x2="120" y2="100"/>\n    <line x1="170" y1="155" x2="120" y2="100"/>\n    <line x1="120" y1="100" x2="105" y2="62"/>\n    <line x1="95" y1="62" x2="150" y2="62"/>\n    <line x1="120" y1="100" x2="120" y2="155"/>\n    <path d="M130 58 Q142 52 148 62" fill="none"/>`,
  },
  cake: {
    bg: '#FCE4EC',
    body: `    <rect x="65" y="130" width="110" height="60" rx="8" fill="#F8BBD0"/>\n    <rect x="80" y="95" width="80" height="40" rx="6" fill="#F48FB1"/>\n    <path d="M65 150 q10 -8 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke="#F06292"/>\n    <rect x="115" y="65" width="10" height="30" fill="#FFF9C4"/>\n    <path d="M120 48 Q112 60 120 66 Q128 60 120 48" fill="#FFB74D"/>`,
  },
  lamp: {
    bg: '#FFF8E1',
    body: `    <path d="M85 100 L155 100 L140 60 L100 60 Z" fill="#FFE082"/>\n    <line x1="120" y1="100" x2="120" y2="165"/>\n    <path d="M95 175 L145 175 L155 195 L85 195 Z" fill="#A1887F"/>\n    <line x1="75" y1="80" x2="62" y2="72" stroke="#FFE082"/>\n    <line x1="165" y1="80" x2="178" y2="72" stroke="#FFE082"/>\n    <line x1="120" y1="45" x2="120" y2="32" stroke="#FFE082"/>`,
  },
  cup: {
    bg: '#EFEBE9',
    body: `    <path d="M80 95 L85 180 Q120 195 155 180 L160 95 Z" fill="#B0BEC5"/>\n    <path d="M160 105 Q190 110 185 135 Q180 150 158 145" fill="none"/>\n    <path d="M100 75 Q105 63 100 52" fill="none" stroke="#B0BEC5"/>\n    <path d="M125 75 Q130 63 125 52" fill="none" stroke="#B0BEC5"/>\n    <path d="M82 95 Q120 108 158 95" fill="none"/>`,
  },

  // ── 心情意象 ──
  heart: {
    bg: '#FCE4EC',
    body: `    <path d="M120 190 Q40 130 60 90 Q80 55 120 95 Q160 55 180 90 Q200 130 120 190 Z" fill="#EF5350"/>`,
  },
  gift: {
    bg: '#FFF3E0',
    body: `    <rect x="65" y="110" width="110" height="90" rx="8" fill="#90CAF9"/>\n    <rect x="65" y="140" width="110" height="14" fill="#FFE082"/>\n    <rect x="112" y="110" width="16" height="90" fill="#FFE082"/>\n    <path d="M120 110 Q95 78 105 98 Q115 110 120 110" fill="#FFE082"/>\n    <path d="M120 110 Q145 78 135 98 Q125 110 120 110" fill="#FFE082"/>`,
  },
  music: {
    bg: '#E8EAF6',
    body: `    <line x1="150" y1="55" x2="150" y2="150"/>\n    <ellipse cx="135" cy="152" rx="18" ry="13" fill="#7986CB"/>\n    <path d="M150 55 Q180 60 175 85" fill="none"/>\n    <line x1="100" y1="75" x2="100" y2="170"/>\n    <ellipse cx="85" cy="172" rx="18" ry="13" fill="#7986CB"/>\n    <path d="M100 75 Q130 80 125 105" fill="none"/>`,
  },
};

/* ---------- 主流程 ---------- */

// 先建目录再逐张输出；缺定义直接报错退出——素材清单与绘制定义必须一一对齐
mkdirSync(OUT_DIR, { recursive: true });

let count = 0;
for (const asset of CANVAS_ASSETS) {
  const drawing = DRAWINGS[asset.id];
  if (!drawing) {
    console.error(`缺少绘制定义: ${asset.id}`);
    process.exit(1);
  }
  writeFileSync(path.join(OUT_DIR, `${asset.id}.svg`), svgWrap(drawing.body, drawing.bg));
  count += 1;
}

console.log(`已生成 ${count} 张素材 → client/public/canvas/`);
