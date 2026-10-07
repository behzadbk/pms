/**
 * تصاویر اختصاصی صفحات معرفی «همین» — همگی SVG دست‌ساز و درون‌کدی هستند (بدون فایل
 * تصویر خارجی، بدون عکس استوک). رنگ‌ها مستقیم از توکن‌های اپ (--color-tile / brass / ink)
 * خوانده می‌شوند، پس با تغییر پالت و حالت تاریک در تنظیمات، تصاویر هم هماهنگ می‌شوند.
 *
 * زبان بصری: برج‌های ساده با پنجره‌های روشن، کارت‌های شیشه‌ای شناور، نقطه‌ی برنجی
 * (همان نقطه‌ی آیکن برند) به‌عنوان تکرار ثابت در همه‌ی صحنه‌ها.
 */
import type { CSSProperties } from 'react'

const T = 'var(--color-tile)'
const TS = 'var(--color-tile-soft)'
const B = 'var(--color-brass)'
const BS = 'var(--color-brass-soft)'
const INK = 'var(--color-ink)'
const CARD = 'var(--color-card)'
const mix = (c: string, pct: number, into = 'white') => `color-mix(in srgb, ${c} ${pct}%, ${into})`

interface P { className?: string; style?: CSSProperties }

/** شبکه‌ی پنجره‌ها؛ الگوی روشن/خاموش قطعی است تا رندر ثابت بماند */
function Windows({
  x, y, cols, rows, w = 9, h = 12, gx = 7, gy = 8, seed = 0, on = B, off = mix(INK, 70, 'black'), twinkle = true,
}: {
  x: number; y: number; cols: number; rows: number; w?: number; h?: number; gx?: number; gy?: number
  seed?: number; on?: string; off?: string; twinkle?: boolean
}) {
  const out = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = (r * 7 + c * 3 + seed) % 5
      const lit = k === 0 || k === 2 || k === 3
      out.push(
        <rect
          key={`${r}-${c}`}
          x={x + c * (w + gx)} y={y + r * (h + gy)} width={w} height={h} rx={2.5}
          fill={lit ? on : off}
          opacity={lit ? 1 : 0.55}
          className={lit && twinkle && k === 3 ? 'ob-anim ob-win' : undefined}
          style={lit && twinkle && k === 3 ? { animationDelay: `${(r + c) * 0.45}s` } : undefined}
        />,
      )
    }
  }
  return <g>{out}</g>
}

function Cloud({ x, y, s = 1, o = 0.9 }: { x: number; y: number; s?: number; o?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
      <ellipse cx="30" cy="22" rx="30" ry="12" fill="white" />
      <ellipse cx="52" cy="14" rx="20" ry="13" fill="white" />
      <ellipse cx="18" cy="14" rx="14" ry="10" fill="white" />
    </g>
  )
}

function Tree({ x, y, s = 1, tone = 0 }: { x: number; y: number; s?: number; tone?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-2.5" y="-6" width="5" height="22" rx="2" fill={mix(B, 70, INK)} />
      <circle cx="0" cy="-16" r="15" fill={mix(T, 78 - tone * 12, INK)} />
      <circle cx="-9" cy="-8" r="10" fill={mix(T, 66 - tone * 10, INK)} />
      <circle cx="9" cy="-9" r="11" fill={mix(T, 86 - tone * 12, 'white')} />
    </g>
  )
}

/** لکه‌ی دور تصویر؛ پس‌زمینه‌ی نرم هر صحنه */
function Blob({ id, cx = 180, cy = 170, rx = 150, ry = 128 }: { id: string; cx?: number; cy?: number; rx?: number; ry?: number }) {
  return (
    <>
      <defs>
        <radialGradient id={id} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor={mix(T, 26)} />
          <stop offset="100%" stopColor={mix(T, 4)} />
        </radialGradient>
      </defs>
      <path
        d={`M${cx - rx} ${cy} C${cx - rx} ${cy - ry * 0.9} ${cx - rx * 0.2} ${cy - ry} ${cx + rx * 0.35} ${cy - ry * 0.92} C${cx + rx} ${cy - ry * 0.8} ${cx + rx * 1.02} ${cy + ry * 0.2} ${cx + rx * 0.74} ${cy + ry * 0.7} C${cx + rx * 0.4} ${cy + ry * 1.05} ${cx - rx * 0.5} ${cy + ry * 1.04} ${cx - rx * 0.86} ${cy + ry * 0.62} C${cx - rx * 1.04} ${cy + ry * 0.4} ${cx - rx} ${cy + ry * 0.2} ${cx - rx} ${cy}Z`}
        fill={`url(#${id})`}
      />
    </>
  )
}

/* ───────────────────────── ۰) اسپلش: افق شهر در سپیده‌دم ───────────────────────── */
export function SplashScene({ className, style }: P) {
  return (
    <svg viewBox="0 0 420 300" preserveAspectRatio="xMidYMax slice" className={className} style={style} aria-hidden="true">
      <defs>
        <linearGradient id="sp-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(T, 55, INK)} />
          <stop offset="1" stopColor={mix(T, 35, INK)} />
        </linearGradient>
        <linearGradient id="sp-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(T, 30)} />
          <stop offset="1" stopColor={mix(T, 14)} />
        </linearGradient>
        <linearGradient id="sp-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(T, 52)} />
          <stop offset="1" stopColor={mix(T, 34)} />
        </linearGradient>
      </defs>

      {/* ردیف دور */}
      <g fill="url(#sp-far)">
        <rect x="6" y="150" width="46" height="150" rx="6" />
        <rect x="58" y="128" width="38" height="172" rx="6" />
        <rect x="318" y="140" width="44" height="160" rx="6" />
        <rect x="368" y="118" width="48" height="182" rx="6" />
        <rect x="262" y="164" width="40" height="136" rx="6" />
      </g>

      {/* ردیف میانی */}
      <g fill="url(#sp-mid)">
        <rect x="34" y="176" width="58" height="124" rx="8" />
        <rect x="300" y="168" width="62" height="132" rx="8" />
        <rect x="104" y="196" width="40" height="104" rx="8" />
        <rect x="262" y="192" width="40" height="108" rx="8" />
      </g>
      <Windows x={44} y={188} cols={3} rows={4} w={9} h={10} gx={8} gy={9} seed={1} on={mix(B, 80)} off={mix(T, 30, INK)} />
      <Windows x={310} y={180} cols={3} rows={4} w={10} h={10} gx={9} gy={9} seed={3} on={mix(B, 80)} off={mix(T, 30, INK)} />

      {/* برج اصلی */}
      <g>
        <rect x="150" y="104" width="120" height="196" rx="12" fill={INK} />
        <rect x="150" y="104" width="120" height="14" rx="7" fill={mix(INK, 80, 'white')} />
        <rect x="204" y="70" width="12" height="38" rx="3" fill={mix(INK, 85, 'white')} />
        <circle cx="210" cy="64" r="7" fill={B} className="ob-anim ob-glow" />
        <Windows x={166} y={132} cols={4} rows={4} w={14} h={15} gx={10} gy={12} seed={2} />
        <path d="M188 300 v-34 a22 22 0 0 1 44 0 v34z" fill={B} />
        <rect x="205" y="274" width="10" height="26" rx="3" fill={mix(B, 55, INK)} />
      </g>

      {/* زمین و درخت */}
      <rect x="0" y="288" width="420" height="12" fill="url(#sp-ground)" />
      <Tree x={20} y={282} s={1.15} />
      <Tree x={128} y={284} s={0.9} tone={1} />
      <Tree x={290} y={284} s={0.95} tone={1} />
      <Tree x={398} y={282} s={1.2} />
    </svg>
  )
}

/* ───────────────────────── ۱) مدیریت کامل مجتمع ───────────────────────── */
export function ManageScene({ className }: P) {
  return (
    <svg viewBox="0 0 360 320" className={className} aria-hidden="true">
      <defs>
        <filter id="m-sh" filterUnits="userSpaceOnUse" x="-60" y="-60" width="480" height="440">
          <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#0b3a3a" floodOpacity="0.22" />
        </filter>
      </defs>
      <Blob id="m-blob" />

      {/* ساختمان‌ها */}
      <rect x="60" y="150" width="76" height="140" rx="9" fill={T} />
      <Windows x={72} y={164} cols={3} rows={5} w={10} h={11} gx={7} gy={9} seed={4} on={mix(B, 82)} off={mix(T, 60, INK)} />
      <rect x="218" y="124" width="84" height="166" rx="9" fill={mix(T, 62)} />
      <Windows x={230} y={138} cols={3} rows={5} w={12} h={12} gx={8} gy={10} seed={1} on={mix(B, 90)} off={mix(T, 40)} twinkle={false} />

      <rect x="124" y="82" width="110" height="208" rx="11" fill={INK} />
      <rect x="124" y="82" width="110" height="13" rx="6.5" fill={mix(INK, 78, 'white')} />
      <rect x="173" y="52" width="12" height="34" rx="3" fill={mix(INK, 80, 'white')} />
      <circle cx="179" cy="46" r="7" fill={B} className="ob-anim ob-glow" />
      <Windows x={138} y={108} cols={4} rows={6} w={12} h={14} gx={9} gy={10} seed={3} />
      <path d="M158 290 v-30 a21 21 0 0 1 42 0 v30z" fill={B} />

      <rect x="30" y="288" width="300" height="9" rx="4.5" fill={mix(T, 40, INK)} opacity="0.5" />
      <Tree x={44} y={282} s={0.9} />
      <Tree x={316} y={282} s={1} tone={1} />

      {/* کارت شناور داشبورد */}
      <g className="ob-anim ob-float" filter="url(#m-sh)" style={{ transformOrigin: '270px 70px' }}>
        <rect x="232" y="26" width="108" height="82" rx="16" fill={CARD} />
        <rect x="244" y="38" width="38" height="7" rx="3.5" fill={mix(INK, 20)} />
        <rect x="244" y="86" width="12" height="14" rx="3" fill={mix(T, 45)} />
        <rect x="262" y="76" width="12" height="24" rx="3" fill={mix(T, 70)} />
        <rect x="280" y="64" width="12" height="36" rx="3" fill={T} />
        <rect x="298" y="70" width="12" height="30" rx="3" fill={B} />
        <circle cx="316" cy="46" r="7" fill={mix(B, 24)} />
        <path d="M312.5 46.2 l2.4 2.5 4-5" stroke={B} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* چیپ‌های شناور */}
      <g className="ob-anim ob-float" style={{ animationDelay: '.9s', transformOrigin: '52px 112px' }} filter="url(#m-sh)">
        <circle cx="52" cy="112" r="22" fill={CARD} />
        <path d="M43 113 l7 -8 l7 8 v9 h-14z" fill={T} />
        <circle cx="58" cy="106" r="3.4" fill={B} />
      </g>
      <g className="ob-anim ob-float" style={{ animationDelay: '1.6s', transformOrigin: '96px 62px' }} filter="url(#m-sh)">
        <rect x="76" y="46" width="40" height="32" rx="12" fill={CARD} />
        <circle cx="90" cy="62" r="5" fill={mix(T, 30)} />
        <circle cx="102" cy="62" r="5" fill={T} />
      </g>
    </svg>
  )
}

/* ───────────────────────── ۲) همه‌چیز در دسترس شما ───────────────────────── */
export function PhoneScene({ className }: P) {
  const rows = [
    { y: 96, done: true, w: 56 },
    { y: 140, done: true, w: 58 },
    { y: 184, done: false, w: 50 },
  ]
  return (
    <svg viewBox="0 0 360 320" className={className} aria-hidden="true">
      <defs>
        <filter id="p-sh" filterUnits="userSpaceOnUse" x="-60" y="-60" width="480" height="440">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#0b3a3a" floodOpacity="0.24" />
        </filter>
        <linearGradient id="p-head" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={T} />
          <stop offset="1" stopColor={mix(T, 70, INK)} />
        </linearGradient>
      </defs>
      <Blob id="p-blob" />

      {/* گوشی */}
      <g filter="url(#p-sh)">
        <rect x="108" y="22" width="144" height="276" rx="28" fill={INK} />
        <rect x="116" y="30" width="128" height="260" rx="22" fill={CARD} />
        <rect x="158" y="36" width="44" height="9" rx="4.5" fill={INK} />
        <rect x="116" y="30" width="128" height="62" rx="22" fill="url(#p-head)" />
        <rect x="116" y="70" width="128" height="22" fill="url(#p-head)" />
        <rect x="170" y="58" width="56" height="8" rx="4" fill="white" opacity="0.9" />
        <rect x="190" y="72" width="36" height="6" rx="3" fill="white" opacity="0.5" />
        <circle cx="140" cy="68" r="11" fill="white" opacity="0.22" />
        <circle cx="140" cy="68" r="4.6" fill={B} />

        {rows.map((r) => (
          <g key={r.y}>
            <rect x="128" y={r.y} width="104" height="34" rx="12" fill={r.done ? TS : BS} />
            <circle cx="214" cy={r.y + 17} r="9" fill={r.done ? T : B} />
            {r.done ? (
              <path d={`M209.6 ${r.y + 17.2} l3.2 3.3 5.4 -6.6`} stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <circle cx="214" cy={r.y + 17} r="3" fill="white" className="ob-anim ob-glow" />
            )}
            <rect x="138" y={r.y + 9} width={r.w} height="6" rx="3" fill={mix(INK, 55)} />
            <rect x="138" y={r.y + 20} width={r.w * 0.6} height="5" rx="2.5" fill={mix(INK, 28)} />
          </g>
        ))}

        <rect x="128" y="232" width="104" height="38" rx="19" fill={T} />
        <rect x="158" y="247" width="44" height="7" rx="3.5" fill="white" />
      </g>

      {/* اعلان زنگ */}
      <g className="ob-anim ob-float" style={{ transformOrigin: '70px 90px' }} filter="url(#p-sh)">
        <rect x="26" y="62" width="82" height="56" rx="18" fill={CARD} />
        <path d="M67 76 a11 11 0 0 1 11 11 v7 l4 5 h-30 l4 -5 v-7 a11 11 0 0 1 11 -11z" fill={B} />
        <circle cx="67" cy="104" r="3.6" fill={B} />
        <circle cx="84" cy="72" r="6" fill="#e5484d" />
      </g>

      {/* چیپ ثبت درخواست */}
      <g className="ob-anim ob-float" style={{ animationDelay: '1.2s', transformOrigin: '292px 150px' }} filter="url(#p-sh)">
        <rect x="262" y="128" width="72" height="44" rx="16" fill={CARD} />
        <circle cx="284" cy="150" r="10" fill={mix(T, 25)} />
        <path d="M279 151 l4 4 l8 -9" stroke={T} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="299" y="145" width="24" height="6" rx="3" fill={mix(INK, 45)} />
        <rect x="299" y="155" width="16" height="5" rx="2.5" fill={mix(INK, 25)} />
      </g>

      <g className="ob-anim ob-float" style={{ animationDelay: '2s', transformOrigin: '300px 244px' }} filter="url(#p-sh)">
        <circle cx="300" cy="244" r="20" fill={B} />
        <path d="M290 244 h20 M300 234 v20" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/* ───────────────────────── ۳) امنیت و آرامش ───────────────────────── */
export function SecurityScene({ className }: P) {
  return (
    <svg viewBox="0 0 360 320" className={className} aria-hidden="true">
      <defs>
        <filter id="s-sh" filterUnits="userSpaceOnUse" x="-60" y="-60" width="480" height="440">
          <feDropShadow dx="0" dy="9" stdDeviation="9" floodColor="#0b3a3a" floodOpacity="0.24" />
        </filter>
        <linearGradient id="s-shield" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={mix(T, 85, 'white')} />
          <stop offset="1" stopColor={mix(T, 75, INK)} />
        </linearGradient>
      </defs>
      <Blob id="s-blob" />

      {/* باجه‌ی نگهبانی */}
      <g>
        <rect x="46" y="190" width="104" height="100" rx="12" fill={INK} />
        <path d="M38 192 h120 l-10 -26 h-100z" fill={B} />
        <rect x="62" y="206" width="72" height="44" rx="9" fill={mix(T, 35)} />
        <path d="M62 224 h72" stroke={INK} strokeWidth="2" opacity="0.4" />
        <circle cx="98" cy="226" r="8" fill={mix(B, 85)} />
        <rect x="88" y="234" width="20" height="16" rx="6" fill={mix(B, 85)} />
        <rect x="62" y="262" width="72" height="12" rx="6" fill={mix(INK, 70, 'white')} />
      </g>

      {/* راه‌بند */}
      <rect x="150" y="262" width="10" height="28" rx="3" fill={mix(INK, 80, 'white')} />
      <rect x="150" y="258" width="150" height="9" rx="4.5" fill="white" transform="rotate(-18 158 262)" />
      <g transform="rotate(-18 158 262)">
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={172 + i * 26} y="258" width="13" height="9" fill="#e5484d" opacity="0.9" />
        ))}
      </g>

      {/* دوربین روی تیر */}
      <rect x="302" y="150" width="8" height="140" rx="3" fill={mix(INK, 82, 'white')} />
      <g className="ob-anim ob-sway" style={{ transformOrigin: '306px 152px' }}>
        <rect x="262" y="136" width="52" height="24" rx="10" fill={INK} />
        <circle cx="272" cy="148" r="8" fill={mix(T, 40)} />
        <circle cx="272" cy="148" r="3.6" fill={B} className="ob-anim ob-glow" />
      </g>
      <path d="M262 150 l-34 20 v-40z" fill={B} opacity="0.14" />

      {/* سپر */}
      <g className="ob-anim ob-float" style={{ transformOrigin: '186px 120px' }} filter="url(#s-sh)">
        <path d="M186 32 L254 58 v58 c0 42 -28 68 -68 84 c-40 -16 -68 -42 -68 -84 V58z" fill="url(#s-shield)" />
        <path d="M186 48 L240 69 v47 c0 33 -22 54 -54 68 c-32 -14 -54 -35 -54 -68 V69z" fill="none" stroke="white" strokeOpacity="0.45" strokeWidth="2" />
        <circle cx="186" cy="112" r="26" fill="white" />
        <path d="M173 112 l9 10 l17 -21" stroke={T} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="244" cy="62" r="6" fill={B} />
      </g>

      {/* کارت QR مهمان */}
      <g className="ob-anim ob-float" style={{ animationDelay: '1.4s', transformOrigin: '300px 224px' }} filter="url(#s-sh)">
        <rect x="256" y="196" width="68" height="68" rx="16" fill={CARD} />
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => {
            const on = (r * 3 + c) % 2 === 0 || (r === 1 && c === 1)
            return <rect key={`${r}${c}`} x={270 + c * 14} y={210 + r * 14} width="10" height="10" rx="2.5" fill={on ? INK : mix(INK, 18)} />
          }),
        )}
        <rect x="270" y="252" width="40" height="4" rx="2" fill={mix(B, 80)} />
      </g>
    </svg>
  )
}

/* ───────────────────────── ۴) زندگی بهتر، در کنار هم ───────────────────────── */
export function LifeScene({ className }: P) {
  return (
    <svg viewBox="0 0 360 320" className={className} aria-hidden="true">
      <defs>
        <filter id="l-sh" filterUnits="userSpaceOnUse" x="-60" y="-60" width="480" height="440">
          <feDropShadow dx="0" dy="9" stdDeviation="9" floodColor="#0b3a3a" floodOpacity="0.22" />
        </filter>
        <linearGradient id="l-pool" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(T, 45)} />
          <stop offset="1" stopColor={mix(T, 78)} />
        </linearGradient>
      </defs>
      <Blob id="l-blob" />
      <Cloud x={238} y={42} s={0.75} />

      {/* ساختمان کافه با سایبان */}
      <rect x="40" y="132" width="150" height="158" rx="12" fill={INK} />
      <path d="M32 138 h166 l-12 -34 h-142z" fill={B} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M${32 + i * 27.7} 138 h27.7 v14 a13.85 13.85 0 0 1 -27.7 0z`} fill={i % 2 ? mix(B, 60, 'white') : B} />
      ))}
      <rect x="58" y="176" width="114" height="62" rx="10" fill={mix(T, 30)} />
      <rect x="58" y="238" width="114" height="8" rx="4" fill={mix(INK, 70, 'white')} />
      {/* تابلو */}
      <rect x="84" y="112" width="62" height="14" rx="7" fill={INK} opacity="0.92" />
      <circle cx="115" cy="119" r="3.5" fill={B} />
      {/* فنجان */}
      <g className="ob-anim ob-float" style={{ transformOrigin: '115px 212px', animationDuration: '6s' }}>
        <path d="M95 198 h40 v14 a20 20 0 0 1 -40 0z" fill="white" />
        <path d="M135 202 h6 a8 8 0 0 1 0 16 h-7" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round" />
        <rect x="95" y="198" width="40" height="7" rx="3.5" fill={mix(B, 80)} />
        <path className="ob-anim ob-steam" d="M106 188 c-5 -7 5 -9 0 -17" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path className="ob-anim ob-steam" style={{ animationDelay: '.8s' }} d="M120 188 c-5 -7 5 -9 0 -17" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>

      {/* استخر */}
      <g filter="url(#l-sh)">
        <rect x="200" y="214" width="132" height="62" rx="18" fill={CARD} />
        <rect x="208" y="222" width="116" height="46" rx="12" fill="url(#l-pool)" />
        <path className="ob-anim ob-wave" d="M214 238 q9 -8 18 0 t18 0 t18 0 t18 0 t18 0 t14 0" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
        <path className="ob-anim ob-wave" style={{ animationDelay: '.7s' }} d="M214 252 q9 -8 18 0 t18 0 t18 0 t18 0 t18 0 t14 0" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.55" />
      </g>
      {/* نردبان */}
      <path d="M312 220 v-14 a6 6 0 0 0 -12 0 M322 220 v-14 a6 6 0 0 0 -12 0" stroke={mix(INK, 60, 'white')} strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* زمین */}
      <rect x="20" y="288" width="320" height="9" rx="4.5" fill={mix(T, 40, INK)} opacity="0.5" />
      <Tree x={334} y={284} s={1.05} tone={1} />
      <Tree x={30} y={284} s={0.95} />

      {/* چیپ تفریحی */}
      <g className="ob-anim ob-float" style={{ animationDelay: '1.1s', transformOrigin: '262px 100px' }} filter="url(#l-sh)">
        <rect x="224" y="78" width="78" height="44" rx="16" fill={CARD} />
        <circle cx="248" cy="100" r="11" fill={mix(B, 30)} />
        <path d="M242 100 h12 M248 94 v12" stroke={B} strokeWidth="3" strokeLinecap="round" />
        <rect x="266" y="95" width="26" height="6" rx="3" fill={mix(INK, 45)} />
        <rect x="266" y="105" width="17" height="5" rx="2.5" fill={mix(INK, 25)} />
      </g>
    </svg>
  )
}

/* ───────────────────────── ۵) صفحه‌ی پایانی: شب ───────────────────────── */
/** آسمان شب: ستاره‌ها و ماه (کل صفحه) */
export function NightSky({ className, style }: P) {
  const stars = [
    [40, 70, 1.6], [92, 130, 1.2], [150, 60, 1.8], [214, 110, 1.2], [276, 52, 1.6], [332, 120, 1.4],
    [380, 70, 1.8], [64, 210, 1.2], [352, 230, 1.2], [118, 270, 1.4], [300, 300, 1.2], [210, 40, 1.2],
    [30, 340, 1.4], [372, 360, 1.2], [180, 330, 1.6],
  ] as const
  return (
    <svg viewBox="0 0 420 844" preserveAspectRatio="xMidYMid slice" className={className} style={style} aria-hidden="true">
      <defs>
        <linearGradient id="n-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(INK, 55, 'black')} />
          <stop offset="0.55" stopColor={mix(T, 30, INK)} />
          <stop offset="1" stopColor={mix(T, 48, INK)} />
        </linearGradient>
        <radialGradient id="n-moon" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={mix(B, 40)} stopOpacity="0.5" />
          <stop offset="1" stopColor={mix(B, 40)} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="420" height="844" fill="url(#n-sky)" />
      {stars.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="white" className="ob-anim ob-twinkle" style={{ animationDelay: `${i * 0.37}s` }} />
      ))}
      <circle cx="338" cy="196" r="70" fill="url(#n-moon)" />
      <circle cx="338" cy="196" r="24" fill={mix(B, 35)} />
      <circle cx="348" cy="190" r="21" fill={mix(INK, 55, 'black')} opacity="0.16" />
    </svg>
  )
}

/** افق شهر در شب (پایین صفحه) */
export function NightScene({ className, style }: P) {
  const dim = mix(INK, 60, 'black')
  return (
    <svg viewBox="0 0 420 300" preserveAspectRatio="xMidYMax slice" className={className} style={style} aria-hidden="true">
      <g fill={mix(INK, 68, 'black')}>
        <rect x="0" y="150" width="58" height="150" rx="6" />
        <rect x="64" y="120" width="52" height="180" rx="6" />
        <rect x="316" y="136" width="56" height="164" rx="6" />
        <rect x="378" y="112" width="52" height="188" rx="6" />
      </g>
      <Windows x={10} y={164} cols={3} rows={5} w={9} h={11} gx={6} gy={10} seed={2} on={mix(B, 85)} off={dim} />
      <Windows x={74} y={136} cols={3} rows={6} w={9} h={11} gx={7} gy={10} seed={4} on={mix(B, 85)} off={dim} />
      <Windows x={326} y={150} cols={3} rows={5} w={10} h={11} gx={7} gy={10} seed={1} on={mix(B, 85)} off={dim} />

      <g>
        <rect x="140" y="64" width="140" height="236" rx="14" fill={mix(INK, 82, 'black')} />
        <rect x="140" y="64" width="140" height="16" rx="8" fill={mix(INK, 70, 'white')} />
        <rect x="204" y="26" width="12" height="42" rx="3" fill={mix(INK, 72, 'white')} />
        <circle cx="210" cy="20" r="8" fill={B} className="ob-anim ob-glow" />
        <Windows x={158} y={98} cols={4} rows={5} w={15} h={16} gx={11} gy={12} seed={3} />
        <path d="M186 300 v-40 a24 24 0 0 1 48 0 v40z" fill={B} />
      </g>
      <rect x="0" y="288" width="420" height="12" fill={mix(T, 30, 'black')} />
    </svg>
  )
}
