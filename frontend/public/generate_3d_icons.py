#!/usr/bin/env python3
"""Generate premium 3D glassmorphism weather icons for VayuVarta."""

import os

OUT = os.path.join(os.path.dirname(__file__), "weather-icons")
os.makedirs(OUT, exist_ok=True)

S = 96

def svg_start(extra=""):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="96" height="96" {extra}>
<defs>
  <!-- Cloud gradient — 3D glass -->
  <radialGradient id="cloudGlass" cx="40%" cy="30%" r="70%">
    <stop offset="0%" stop-color="rgba(220,235,255,0.35)"/>
    <stop offset="50%" stop-color="rgba(180,210,240,0.18)"/>
    <stop offset="100%" stop-color="rgba(140,180,220,0.08)"/>
  </radialGradient>
  <!-- Sun gradient -->
  <radialGradient id="sunGrad" cx="45%" cy="40%" r="55%">
    <stop offset="0%" stop-color="#FFE066"/>
    <stop offset="50%" stop-color="#FBBF24"/>
    <stop offset="100%" stop-color="#F59E0B"/>
  </radialGradient>
  <!-- Moon gradient -->
  <radialGradient id="moonGrad" cx="35%" cy="35%" r="60%">
    <stop offset="0%" stop-color="#C4B5FD"/>
    <stop offset="50%" stop-color="#A78BFA"/>
    <stop offset="100%" stop-color="#8B5CF6"/>
  </radialGradient>
  <!-- Rain drop gradient -->
  <linearGradient id="rainGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#93C5FD"/>
    <stop offset="100%" stop-color="#3B82F6"/>
  </linearGradient>
  <!-- Snow gradient -->
  <radialGradient id="snowGrad" cx="40%" cy="35%" r="60%">
    <stop offset="0%" stop-color="#E0F2FE"/>
    <stop offset="100%" stop-color="#BAE6FD"/>
  </radialGradient>
  <!-- Lightning gradient -->
  <linearGradient id="lightGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#FDE68A"/>
    <stop offset="100%" stop-color="#F59E0B"/>
  </linearGradient>
  <!-- Storm cloud gradient -->
  <radialGradient id="stormCloud" cx="40%" cy="30%" r="70%">
    <stop offset="0%" stop-color="rgba(180,170,220,0.3)"/>
    <stop offset="50%" stop-color="rgba(130,120,180,0.15)"/>
    <stop offset="100%" stop-color="rgba(80,70,140,0.08)"/>
  </radialGradient>
  <!-- Fog gradient -->
  <linearGradient id="fogGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="rgba(200,210,225,0.0)"/>
    <stop offset="30%" stop-color="rgba(200,210,225,0.25)"/>
    <stop offset="70%" stop-color="rgba(200,210,225,0.25)"/>
    <stop offset="100%" stop-color="rgba(200,210,225,0.0)"/>
  </linearGradient>
  <!-- Glass highlight -->
  <linearGradient id="glassHighlight" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="rgba(255,255,255,0.4)"/>
    <stop offset="100%" stop-color="rgba(255,255,255,0.0)"/>
  </linearGradient>
  <!-- Hot gradient -->
  <radialGradient id="hotGrad" cx="45%" cy="40%" r="55%">
    <stop offset="0%" stop-color="#FCD34D"/>
    <stop offset="50%" stop-color="#F59E0B"/>
    <stop offset="100%" stop-color="#DC2626"/>
  </radialGradient>
  <!-- Cyan cold gradient -->
  <radialGradient id="coldGrad" cx="45%" cy="40%" r="55%">
    <stop offset="0%" stop-color="#E0F2FE"/>
    <stop offset="50%" stop-color="#7DD3FC"/>
    <stop offset="100%" stop-color="#0EA5E9"/>
  </radialGradient>
  <!-- Sunrise/Sunset -->
  <radialGradient id="sunriseGrad" cx="50%" cy="80%" r="50%">
    <stop offset="0%" stop-color="#FDE68A"/>
    <stop offset="100%" stop-color="#F97316"/>
  </radialGradient>
</defs>'''

SVG_END = "</svg>"

# ── 3D Cloud with glass effect ───────────────────────────────────────────────
def cloud3d(cx=48, cy=44, s=1.0, fill="url(#cloudGlass)", stroke_w=1.5):
    """Premium 3D cloud with glass highlight."""
    return f'''
<ellipse cx="{cx}" cy="{cy}" rx="{30*s}" ry="{13*s}" fill="{fill}" stroke="rgba(200,220,255,0.25)" stroke-width="{stroke_w}"/>
<circle cx="{cx-10*s}" cy="{cy-11*s}" r="{13*s}" fill="{fill}" stroke="rgba(200,220,255,0.25)" stroke-width="{stroke_w}"/>
<circle cx="{cx+8*s}" cy="{cy-15*s}" r="{15*s}" fill="{fill}" stroke="rgba(200,220,255,0.25)" stroke-width="{stroke_w}"/>
<circle cx="{cx+0*s}" cy="{cy-9*s}" r="{11*s}" fill="{fill}"/>
<!-- Glass highlight -->
<ellipse cx="{cx+2*s}" cy="{cy-17*s}" rx="{8*s}" ry="{4*s}" fill="url(#glassHighlight)" opacity="0.5"/>'''

# ── 3D Sun with glow ────────────────────────────────────────────────────────
def sun3d(cx=48, cy=40, r=16):
    """3D sun with radial gradient and glow."""
    import math
    rays = []
    for i in range(8):
        angle = math.radians(i * 45)
        inner = r + 4
        outer = r + 10
        x1 = cx + inner * math.cos(angle)
        y1 = cy + inner * math.sin(angle)
        x2 = cx + outer * math.cos(angle)
        y2 = cy + outer * math.sin(angle)
        rays.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="url(#sunGrad)" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>')
    return f'''
<circle cx="{cx}" cy="{cy}" r="{r+12}" fill="rgba(251,191,36,0.08)"/>
<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#sunGrad)" stroke="rgba(251,191,36,0.3)" stroke-width="1"/>
<ellipse cx="{cx-3}" cy="{cy-4}" rx="{r*0.4}" ry="{r*0.3}" fill="rgba(255,255,255,0.25)"/>
{"".join(rays)}'''

# ── 3D Moon ──────────────────────────────────────────────────────────────────
def moon3d(cx=46, cy=38, r=16):
    return f'''
<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#moonGrad)" stroke="rgba(167,139,250,0.2)" stroke-width="1"/>
<circle cx="{cx+7}" cy="{cy-5}" r="{r*0.7}" fill="rgba(10,17,40,0.9)"/>
<ellipse cx="{cx-3}" cy="{cy-5}" rx="{r*0.25}" ry="{r*0.2}" fill="rgba(255,255,255,0.15)"/>'''

# ── 3D Rain drops ────────────────────────────────────────────────────────────
def rain_drops3d(cx=48, y_start=60, count=3, spacing=10):
    drops = []
    for i in range(count):
        x = cx - ((count-1) * spacing / 2) + i * spacing
        y1 = y_start + (i % 2) * 3
        # Drop body
        drops.append(f'''<path d="M{x},{y1+4} Q{x-3},{y1+10} {x},{y1+14} Q{x+3},{y1+10} {x},{y1+4} Z" fill="url(#rainGrad)" opacity="0.85"/>
<ellipse cx="{x-0.5}" cy="{y1+6}" rx="1" ry="1.5" fill="rgba(255,255,255,0.35)"/>''')
    return "\n".join(drops)

# ── 3D Snowflakes ────────────────────────────────────────────────────────────
def snow3d(cx=48, y_start=60, count=3, spacing=10):
    flakes = []
    for i in range(count):
        x = cx - ((count-1) * spacing / 2) + i * spacing
        y = y_start + (i % 2) * 4
        flakes.append(f'''<circle cx="{x}" cy="{y}" r="3" fill="url(#snowGrad)" stroke="rgba(186,230,253,0.4)" stroke-width="0.8"/>
<circle cx="{x-0.5}" cy="{y-0.5}" r="1" fill="rgba(255,255,255,0.4)"/>''')
    return "\n".join(flakes)

# ── 3D Lightning ─────────────────────────────────────────────────────────────
def lightning3d(cx=48, y_start=46):
    return f'''
<polygon points="{cx},{y_start} {cx-6},{y_start+14} {cx+1},{y_start+14} {cx-4},{y_start+28} {cx+6},{y_start+12} {cx-1},{y_start+12} {cx+5},{y_start}" fill="url(#lightGrad)" stroke="rgba(245,158,11,0.3)" stroke-width="0.8"/>
<line x1="{cx-1}" y1="{y_start+2}" x2="{cx-4}" y2="{y_start+11}" stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-linecap="round"/>'''

# ── Wind curves ──────────────────────────────────────────────────────────────
def wind3d(cx=24, cy=36, count=3, strong=False):
    curves = []
    for i in range(count):
        y = cy + i * 11
        w = 42 - i * 6 if not strong else 48 - i * 5
        sw = 2.0 if not strong else 2.5
        op = 0.7 - i * 0.1
        curves.append(f'<path d="M{cx},{y} Q{cx+w*0.5},{y-7} {cx+w},{y}" stroke="rgba(200,220,255,0.5)" stroke-width="{sw}" stroke-linecap="round" fill="none" opacity="{op}"/>')
    return "\n".join(curves)

# ── Mist lines ───────────────────────────────────────────────────────────────
def mist3d(cx=20, cy=44, count=3):
    lines = []
    for i in range(count):
        y = cy + i * 10
        w = 56 - i * 6
        op = 0.5 - i * 0.1
        lines.append(f'<line x1="{cx+i*4}" y1="{y}" x2="{cx+w}" y2="{y}" stroke="url(#fogGrad)" stroke-width="2" stroke-linecap="round" opacity="{op}"/>')
    return "\n".join(lines)


# ── Icon definitions ─────────────────────────────────────────────────────────
icons = {}

# 01 — Clear Sunny
icons["clear.svg"] = f'''{svg_start()}
{sun3d(48, 38, 16)}
{SVG_END}'''

# 02 — Hot
icons["hot.svg"] = f'''{svg_start()}
<circle cx="48" cy="36" r="28" fill="rgba(245,158,11,0.06)"/>
<circle cx="48" cy="36" r="16" fill="url(#hotGrad)" stroke="rgba(245,158,11,0.2)" stroke-width="1"/>
<ellipse cx="44" cy="32" rx="6" ry="4" fill="rgba(255,255,255,0.2)"/>
<!-- Heat waves -->
<path d="M34,70 Q38,66 42,70 Q46,74 50,70 Q54,66 58,70 Q62,74 66,70" stroke="url(#hotGrad)" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.5"/>
<path d="M30,76 Q34,72 38,76 Q42,80 46,76 Q50,72 54,76 Q58,80 62,76" stroke="url(#hotGrad)" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.3"/>
<!-- Sun rays -->
{"".join([f'<line x1="{48+22*__import__("math").cos(__import__("math").radians(i*45)):.1f}" y1="{36+22*__import__("math").sin(__import__("math").radians(i*45)):.1f}" x2="{48+28*__import__("math").cos(__import__("math").radians(i*45)):.1f}" y2="{36+28*__import__("math").sin(__import__("math").radians(i*45)):.1f}" stroke="url(#hotGrad)" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>' for i in range(8)])}
{SVG_END}'''

# 03 — Mostly Clear
icons["mostly-clear.svg"] = f'''{svg_start()}
<circle cx="60" cy="30" r="20" fill="rgba(251,191,36,0.06)"/>
<circle cx="60" cy="30" r="12" fill="url(#sunGrad)" stroke="rgba(251,191,36,0.2)" stroke-width="1"/>
<ellipse cx="57" cy="27" rx="4" ry="3" fill="rgba(255,255,255,0.2)"/>
{cloud3d(44, 50, 0.75)}
{SVG_END}'''

# 04 — Cold
icons["cold.svg"] = f'''{svg_start()}
<circle cx="52" cy="32" r="16" fill="rgba(125,211,252,0.08)"/>
<circle cx="52" cy="32" r="10" fill="url(#coldGrad)" stroke="rgba(125,211,252,0.2)" stroke-width="1"/>
<ellipse cx="49" cy="29" rx="3" ry="2" fill="rgba(255,255,255,0.25)"/>
<!-- Frost crystal -->
<polygon points="40,56 42,50 44,56 42,62" fill="none" stroke="url(#coldGrad)" stroke-width="1.5" opacity="0.7"/>
<line x1="42" y1="48" x2="42" y2="64" stroke="url(#coldGrad)" stroke-width="1" opacity="0.6"/>
<line x1="38" y1="56" x2="46" y2="56" stroke="url(#coldGrad)" stroke-width="1" opacity="0.6"/>
{SVG_END}'''

# 05 — Extreme Cold
icons["extreme-cold.svg"] = f'''{svg_start()}
<polygon points="48,14 50,8 52,14 50,20" fill="none" stroke="url(#coldGrad)" stroke-width="1.5" opacity="0.8"/>
<line x1="50" y1="6" x2="50" y2="22" stroke="url(#coldGrad)" stroke-width="1" opacity="0.6"/>
<line x1="44" y1="14" x2="56" y2="14" stroke="url(#coldGrad)" stroke-width="1" opacity="0.6"/>
<polygon points="28,44 30,38 32,44 30,50" fill="none" stroke="url(#coldGrad)" stroke-width="1.5" opacity="0.7"/>
<line x1="30" y1="36" x2="30" y2="52" stroke="url(#coldGrad)" stroke-width="1" opacity="0.5"/>
<line x1="26" y1="44" x2="34" y2="44" stroke="url(#coldGrad)" stroke-width="1" opacity="0.5"/>
<polygon points="64,52 66,46 68,52 66,58" fill="none" stroke="url(#coldGrad)" stroke-width="1.5" opacity="0.6"/>
<line x1="66" y1="44" x2="66" y2="60" stroke="url(#coldGrad)" stroke-width="1" opacity="0.5"/>
<line x1="62" y1="52" x2="70" y2="52" stroke="url(#coldGrad)" stroke-width="1" opacity="0.5"/>
<polygon points="46,66 48,60 50,66 48,72" fill="none" stroke="url(#coldGrad)" stroke-width="1.5" opacity="0.5"/>
<line x1="48" y1="58" x2="48" y2="74" stroke="url(#coldGrad)" stroke-width="1" opacity="0.4"/>
{SVG_END}'''

# 06 — Cloudy
icons["cloudy.svg"] = f'''{svg_start()}
{cloud3d(48, 42, 1.0)}
{SVG_END}'''

# 07 — Mostly Cloudy
icons["mostly-cloudy.svg"] = f'''{svg_start()}
<circle cx="64" cy="28" r="14" fill="rgba(251,191,36,0.06)"/>
<circle cx="64" cy="28" r="9" fill="url(#sunGrad)" stroke="rgba(251,191,36,0.15)" stroke-width="1"/>
{cloud3d(44, 48, 0.95)}
{SVG_END}'''

# 08 — Partly Cloudy
icons["partly-cloudy.svg"] = f'''{svg_start()}
<circle cx="64" cy="28" r="18" fill="rgba(251,191,36,0.06)"/>
<circle cx="64" cy="28" r="11" fill="url(#sunGrad)" stroke="rgba(251,191,36,0.2)" stroke-width="1"/>
<ellipse cx="61" cy="25" rx="4" ry="3" fill="rgba(255,255,255,0.2)"/>
{cloud3d(42, 50, 0.8)}
{SVG_END}'''

# 09 — Overcast
icons["overcast.svg"] = f'''{svg_start()}
{cloud3d(52, 32, 0.7, "rgba(160,180,210,0.12)", 1.2)}
{cloud3d(44, 46, 1.0)}
{SVG_END}'''

# 10 — Fog
icons["fog.svg"] = f'''{svg_start()}
{cloud3d(48, 28, 0.65, "rgba(200,215,235,0.15)", 1.2)}
{mist3d(16, 50, 4)}
{SVG_END}'''

# 11 — Haze
icons["haze.svg"] = f'''{svg_start()}
{mist3d(12, 30, 5)}
{SVG_END}'''

# 12 — Light Rain
icons["light-rain.svg"] = f'''{svg_start()}
{cloud3d(48, 32, 0.8)}
{rain_drops3d(48, 54, 2, 12)}
{SVG_END}'''

# 13 — Rain
icons["rain.svg"] = f'''{svg_start()}
{cloud3d(48, 30, 0.85)}
{rain_drops3d(48, 52, 3, 10)}
{SVG_END}'''

# 14 — Heavy Rain
icons["heavy-rain.svg"] = f'''{svg_start()}
{cloud3d(48, 28, 0.9, "rgba(120,160,220,0.18)", 1.8)}
{rain_drops3d(40, 50, 2, 8)}
{rain_drops3d(56, 54, 2, 8)}
{SVG_END}'''

# 15 — Drizzle
icons["drizzle.svg"] = f'''{svg_start()}
{cloud3d(48, 32, 0.75)}
<circle cx="40" cy="56" r="1.5" fill="url(#rainGrad)" opacity="0.6"/>
<circle cx="52" cy="60" r="1.5" fill="url(#rainGrad)" opacity="0.5"/>
<circle cx="46" cy="64" r="1.5" fill="url(#rainGrad)" opacity="0.5"/>
{SVG_END}'''

# 16 — Freezing Rain
icons["freezing-rain.svg"] = f'''{svg_start()}
{cloud3d(48, 30, 0.8)}
<path d="M40,50 Q38,56 40,60" stroke="url(#rainGrad)" stroke-width="1.8" stroke-linecap="round" fill="none"/>
<path d="M56,50 Q54,56 56,60" stroke="url(#rainGrad)" stroke-width="1.8" stroke-linecap="round" fill="none"/>
<polygon points="48,58 46,54 48,50 50,54" fill="none" stroke="url(#coldGrad)" stroke-width="1" opacity="0.7"/>
{SVG_END}'''

# 17 — Showers
icons["showers.svg"] = f'''{svg_start()}
{cloud3d(48, 32, 0.82)}
<path d="M38,52 L36,60" stroke="url(#rainGrad)" stroke-width="1.8" stroke-linecap="round"/>
<path d="M54,54 L52,62" stroke="url(#rainGrad)" stroke-width="1.8" stroke-linecap="round"/>
<path d="M46,56 L44,64" stroke="url(#rainGrad)" stroke-width="1.8" stroke-linecap="round"/>
{SVG_END}'''

# 18 — Thunderstorm
icons["thunderstorm.svg"] = f'''{svg_start()}
{cloud3d(48, 26, 0.85, "url(#stormCloud)", 1.8)}
{lightning3d(48, 40)}
{SVG_END}'''

# 19 — Thunderstorm + Rain
icons["thunderstorm-rain.svg"] = f'''{svg_start()}
{cloud3d(48, 24, 0.85, "url(#stormCloud)", 1.8)}
{lightning3d(48, 36)}
<path d="M32,54 L30,62" stroke="url(#rainGrad)" stroke-width="1.5" stroke-linecap="round"/>
<path d="M62,54 L60,62" stroke="url(#rainGrad)" stroke-width="1.5" stroke-linecap="round"/>
{SVG_END}'''

# 20 — Severe Thunderstorm
icons["severe-thunderstorm.svg"] = f'''{svg_start()}
{cloud3d(48, 22, 0.95, "url(#stormCloud)", 2.0)}
{lightning3d(46, 34)}
<path d="M30,52 L28,62" stroke="url(#rainGrad)" stroke-width="1.8" stroke-linecap="round"/>
<path d="M40,52 L38,62" stroke="url(#rainGrad)" stroke-width="1.8" stroke-linecap="round"/>
<path d="M56,52 L54,62" stroke="url(#rainGrad)" stroke-width="1.8" stroke-linecap="round"/>
<path d="M64,50 L62,60" stroke="url(#rainGrad)" stroke-width="1.8" stroke-linecap="round"/>
{SVG_END}'''

# 21 — Squall
icons["squall.svg"] = f'''{svg_start()}
{cloud3d(48, 28, 0.8, "rgba(160,180,220,0.15)", 1.5)}
{wind3d(24, 52, 3)}
{SVG_END}'''

# 22 — Windy
icons["windy.svg"] = f'''{svg_start()}
{wind3d(18, 30, 3)}
{SVG_END}'''

# 23 — Strong Wind
icons["strong-wind.svg"] = f'''{svg_start()}
{wind3d(14, 26, 4, True)}
{SVG_END}'''

# 24 — Dust Storm
icons["dust-storm.svg"] = f'''{svg_start()}
{wind3d(18, 30, 3)}
<circle cx="58" cy="34" r="1.5" fill="rgba(180,160,130,0.4)"/>
<circle cx="64" cy="40" r="1.2" fill="rgba(180,160,130,0.35)"/>
<circle cx="52" cy="42" r="1.8" fill="rgba(180,160,130,0.3)"/>
<circle cx="60" cy="48" r="1" fill="rgba(180,160,130,0.3)"/>
{SVG_END}'''

# 25 — Smoke
icons["smoke.svg"] = f'''{svg_start()}
<path d="M18,38 Q30,34 42,38 Q54,42 66,38 Q74,34 82,38" stroke="rgba(160,170,185,0.3)" stroke-width="2" stroke-linecap="round" fill="none"/>
<path d="M14,48 Q26,44 38,48 Q50,52 62,48 Q70,44 78,48" stroke="rgba(160,170,185,0.25)" stroke-width="2" stroke-linecap="round" fill="none"/>
<path d="M20,58 Q32,54 44,58 Q56,62 68,58 Q76,54 84,58" stroke="rgba(160,170,185,0.2)" stroke-width="2" stroke-linecap="round" fill="none"/>
{SVG_END}'''

# 26 — Light Snow
icons["light-snow.svg"] = f'''{svg_start()}
{cloud3d(48, 30, 0.75)}
{snow3d(48, 54, 2, 14)}
{SVG_END}'''

# 27 — Snow
icons["snow.svg"] = f'''{svg_start()}
{cloud3d(48, 28, 0.82)}
{snow3d(48, 52, 3, 10)}
{SVG_END}'''

# 28 — Heavy Snow
icons["heavy-snow.svg"] = f'''{svg_start()}
{cloud3d(48, 26, 0.88, "rgba(186,230,253,0.12)", 1.8)}
{snow3d(38, 50, 3, 8)}
{snow3d(56, 58, 2, 8)}
{SVG_END}'''

# 29 — Sleet
icons["sleet.svg"] = f'''{svg_start()}
{cloud3d(48, 28, 0.8)}
<path d="M38,48 L36,56" stroke="url(#rainGrad)" stroke-width="1.5" stroke-linecap="round"/>
<circle cx="50" cy="56" r="2.5" fill="url(#snowGrad)" stroke="rgba(186,230,253,0.3)" stroke-width="0.8"/>
<path d="M58,48 L56,56" stroke="url(#rainGrad)" stroke-width="1.5" stroke-linecap="round"/>
<circle cx="44" cy="62" r="2.5" fill="url(#snowGrad)" stroke="rgba(186,230,253,0.3)" stroke-width="0.8"/>
{SVG_END}'''

# 30 — Blizzard
icons["blizzard.svg"] = f'''{svg_start()}
{cloud3d(48, 26, 0.8)}
{wind3d(24, 48, 2)}
{snow3d(48, 64, 3, 10)}
{SVG_END}'''

# 31 — Frost
icons["frost.svg"] = f'''{svg_start()}
<polygon points="48,14 50,8 52,14 50,20" fill="none" stroke="url(#coldGrad)" stroke-width="1.5" opacity="0.7"/>
<line x1="50" y1="6" x2="50" y2="22" stroke="url(#coldGrad)" stroke-width="1" opacity="0.5"/>
<line x1="44" y1="14" x2="56" y2="14" stroke="url(#coldGrad)" stroke-width="1" opacity="0.5"/>
<polygon points="28,50 30,44 32,50 30,56" fill="none" stroke="url(#coldGrad)" stroke-width="1.5" opacity="0.6"/>
<line x1="30" y1="42" x2="30" y2="58" stroke="url(#coldGrad)" stroke-width="1" opacity="0.4"/>
<line x1="26" y1="50" x2="34" y2="50" stroke="url(#coldGrad)" stroke-width="1" opacity="0.4"/>
<polygon points="64,56 66,50 68,56 66,62" fill="none" stroke="url(#coldGrad)" stroke-width="1.5" opacity="0.5"/>
<line x1="66" y1="48" x2="66" y2="64" stroke="url(#coldGrad)" stroke-width="1" opacity="0.4"/>
<line x1="62" y1="56" x2="70" y2="56" stroke="url(#coldGrad)" stroke-width="1" opacity="0.4"/>
{SVG_END}'''

# 32 — Sunrise
icons["sunrise.svg"] = f'''{svg_start()}
<line x1="14" y1="62" x2="82" y2="62" stroke="rgba(200,210,225,0.3)" stroke-width="1.5" stroke-linecap="round"/>
<path d="M48,62 A16,16 0 0,1 48,30" stroke="url(#sunriseGrad)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
<ellipse cx="48" cy="30" rx="10" ry="6" fill="url(#sunriseGrad)" opacity="0.15"/>
<line x1="48" y1="26" x2="48" y2="18" stroke="url(#sunriseGrad)" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
<line x1="30" y1="42" x2="24" y2="36" stroke="url(#sunriseGrad)" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
<line x1="66" y1="42" x2="72" y2="36" stroke="url(#sunriseGrad)" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
{SVG_END}'''

# 33 — Sunset
icons["sunset.svg"] = f'''{svg_start()}
<line x1="14" y1="62" x2="82" y2="62" stroke="rgba(200,210,225,0.3)" stroke-width="1.5" stroke-linecap="round"/>
<path d="M48,62 A16,16 0 0,0 48,30" stroke="#F97316" stroke-width="2.5" fill="none" stroke-linecap="round"/>
<ellipse cx="48" cy="30" rx="10" ry="6" fill="#F97316" opacity="0.15"/>
<line x1="48" y1="26" x2="48" y2="18" stroke="#F97316" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
<line x1="30" y1="42" x2="24" y2="36" stroke="#F97316" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
<line x1="66" y1="42" x2="72" y2="36" stroke="#F97316" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
{SVG_END}'''

# 34 — Clear Night
icons["clear-night.svg"] = f'''{svg_start()}
{moon3d(46, 36, 16)}
<circle cx="68" cy="24" r="1.5" fill="rgba(255,255,255,0.5)"/>
<circle cx="76" cy="34" r="1" fill="rgba(255,255,255,0.35)"/>
<circle cx="70" cy="42" r="1.2" fill="rgba(255,255,255,0.4)"/>
{SVG_END}'''

# 35 — Partly Cloudy Night
icons["partly-cloudy-night.svg"] = f'''{svg_start()}
{moon3d(60, 26, 12)}
{cloud3d(42, 50, 0.8)}
<circle cx="74" cy="20" r="1" fill="rgba(255,255,255,0.3)"/>
<circle cx="78" cy="28" r="0.8" fill="rgba(255,255,255,0.25)"/>
{SVG_END}'''

# 36 — Cloudy Night
icons["cloudy-night.svg"] = f'''{svg_start()}
{moon3d(62, 26, 10)}
{cloud3d(46, 44, 0.85)}
{SVG_END}'''

# 37 — Rainy Night
icons["rainy-night.svg"] = f'''{svg_start()}
{moon3d(64, 24, 9)}
{cloud3d(46, 34, 0.8)}
{rain_drops3d(46, 54, 2, 10)}
{SVG_END}'''

# 38 — Thunderstorm Night
icons["thunderstorm-night.svg"] = f'''{svg_start()}
{moon3d(66, 22, 8)}
{cloud3d(46, 28, 0.82, "url(#stormCloud)", 1.5)}
{lightning3d(46, 42)}
{SVG_END}'''

# 39 — Unknown
icons["unknown.svg"] = f'''{svg_start()}
<circle cx="48" cy="40" r="18" fill="rgba(100,116,139,0.08)" stroke="rgba(100,116,139,0.2)" stroke-width="1.5"/>
<path d="M42,34 Q42,28 48,28 Q54,28 54,34 Q54,38 48,42 L48,46" stroke="rgba(200,210,225,0.4)" stroke-width="2" stroke-linecap="round" fill="none"/>
<circle cx="48" cy="52" r="1.5" fill="rgba(200,210,225,0.4)"/>
{SVG_END}'''


# ── Write all SVG files ──────────────────────────────────────────────────────
for name, svg_content in icons.items():
    path = os.path.join(OUT, name)
    with open(path, "w") as f:
        f.write(svg_content.strip())
    print(f"  OK {name}")

print(f"\nDone! Generated {len(icons)} 3D glassmorphism weather icons in {OUT}")
