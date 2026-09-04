#!/usr/bin/env python3
"""Generate the complete VayuVarta weather icon set as premium SVG files."""

import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "weather-icons")
os.makedirs(OUT, exist_ok=True)

# ── Design tokens ────────────────────────────────────────────────────────────
WHITE = "#E8F0FE"      # Primary — slightly warm white
CYAN = "#67E8F9"       # Rain / cold accents
BLUE = "#60A5FA"       # Rain / water
VIOLET = "#A78BFA"     # Night / storm
AMBER = "#FBBF24"      # Sun / hot / lightning
GRAY = "#64748B"       # Fog / muted elements
FROST = "#BAE6FD"      # Snow / frost

# Cloud fill (glassmorphism-ready)
CLOUD_FILL = "rgba(200,220,240,0.12)"
CLOUD_STROKE = WHITE
CLOUD_STROKE_W = 2.0

S = 96  # viewBox size


def svg_open(extra=""):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="96" height="96" fill="none" {extra}>'

SVG_END = "</svg>"

# ── Reusable primitives ──────────────────────────────────────────────────────
def sun(cx=40, cy=38, r=14, color=AMBER, sw=2.0, ray_len=6, ray_gap=22):
    """Clean geometric sun: circle + 8 rays."""
    rays = []
    import math
    for i in range(8):
        angle = math.radians(i * 45)
        inner = r + ray_gap - ray_len
        outer = r + ray_gap
        x1 = cx + inner * math.cos(angle)
        y1 = cy + inner * math.sin(angle)
        x2 = cx + outer * math.cos(angle)
        y2 = cy + outer * math.sin(angle)
        rays.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>')
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" stroke="{color}" stroke-width="{sw}"/>' + "\n".join(rays)

def cloud(cx=40, cy=42, scale=1.0, fill=CLOUD_FILL, stroke=CLOUD_STROKE, sw=CLOUD_STROKE_W):
    """Soft rounded cloud — consistent silhouette throughout."""
    s = scale
    # Main body
    parts = [
        f'<ellipse cx="{cx}" cy="{cy}" rx="{28*s}" ry="{12*s}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"/>',
        f'<circle cx="{cx-8*s}" cy="{cy-10*s}" r="{12*s}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>',
        f'<circle cx="{cx+8*s}" cy="{cy-14*s}" r="{14*s}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>',
        f'<circle cx="{cx+2*s}" cy="{cy-8*s}" r="{10*s}" fill="{fill}"/>',
    ]
    return "\n".join(parts)

def moon(cx=42, cy=36, r=14, color=VIOLET, sw=2.0):
    """Crescent moon."""
    return f'''<circle cx="{cx}" cy="{cy}" r="{r}" stroke="{color}" stroke-width="{sw}"/>
<circle cx="{cx+6}" cy="{cy-4}" r="{10}" fill="rgba(10,17,40,0.85)" stroke="none"/>'''

def rain_drops(cx=40, cy_start=58, count=3, color=BLUE, sw=1.8, spacing=8):
    """Thin rain drops — clean lines."""
    drops = []
    for i in range(count):
        x = cx - ((count-1) * spacing / 2) + i * spacing
        y1 = cy_start + (i % 2) * 4
        y2 = y1 + 10
        drops.append(f'<line x1="{x:.1f}" y1="{y1:.1f}" x2="{x-1:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>')
    return "\n".join(drops)

def heavy_rain_drops(cx=40, cy_start=56, color=BLUE, sw=2.0):
    """Multiple strong rain streaks."""
    drops = []
    positions = [(-12, 0), (-4, 3), (4, 1), (12, 4)]
    for dx, dy in positions:
        x = cx + dx
        y1 = cy_start + dy
        y2 = y1 + 14
        drops.append(f'<line x1="{x}" y1="{y1}" x2="{x-1.5}" y2="{y2}" stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>')
    return "\n".join(drops)

def snowflakes(cx=40, cy_start=58, count=3, color=FROST, size=3, spacing=10):
    """Simple snowflake dots."""
    flakes = []
    for i in range(count):
        x = cx - ((count-1) * spacing / 2) + i * spacing
        y = cy_start + (i % 2) * 5
        flakes.append(f'<circle cx="{x}" cy="{y}" r="{size}" fill="{color}"/>')
    return "\n".join(flakes)

def lightning_bolt(cx=44, cy_start=44, color=AMBER, sw=2.0):
    """Clean angular lightning bolt."""
    return f'''<polyline points="{cx},{cy_start} {cx-5},{cy_start+12} {cx+2},{cy_start+12} {cx-3},{cy_start+26}" 
    stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'''

def wind_curves(cx=30, cy=42, count=3, color=WHITE, sw=1.8):
    """Smooth directional wind arcs."""
    curves = []
    for i in range(count):
        y = cy + i * 10
        w = 30 - i * 4
        curves.append(f'<path d="M{cx},{y} Q{cx+w*0.5},{y-6} {cx+w},{y}" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" fill="none"/>')
    return "\n".join(curves)

def mist_lines(cx=20, cy=40, count=3, color=GRAY, sw=1.5):
    """Horizontal soft mist layers."""
    lines = []
    for i in range(count):
        y = cy + i * 10
        w = 56 - i * 8
        lines.append(f'<line x1="{cx + i*3}" y1="{y}" x2="{cx + w}" y2="{y}" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" opacity="{0.8 - i*0.15}"/>')
    return "\n".join(lines)


# ── Icon definitions ─────────────────────────────────────────────────────────
icons = {}

# 01 — Clear Sunny Day
icons["clear.svg"] = f'''{svg_open()}
{sun(48, 38, 16, AMBER, 2.0, 7, 24)}
{SVG_END}'''

# 02 — Hot / Very Hot
icons["hot.svg"] = f'''{svg_open()}
{sun(48, 36, 16, "#F59E0B", 2.0, 7, 24)}
<line x1="36" y1="68" x2="60" y2="68" stroke="#F59E0B" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
<line x1="32" y1="73" x2="64" y2="73" stroke="#F59E0B" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>
<path d="M38,78 Q42,75 46,78 Q50,81 54,78" stroke="#F59E0B" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0.3"/>
{SVG_END}'''

# 03 — Mostly Clear
icons["mostly-clear.svg"] = f'''{svg_open()}
{sun(56, 32, 12, AMBER, 1.8, 5, 20)}
{cloud(40, 48, 0.8, CLOUD_FILL, WHITE, 1.8)}
{SVG_END}'''

# 04 — Cold
icons["cold.svg"] = f'''{svg_open()}
{sun(52, 34, 10, CYAN, 1.8, 5, 18)}
<polyline points="38,62 42,58 46,62 42,66 Z" stroke="{FROST}" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
<line x1="42" y1="55" x2="42" y2="69" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
<line x1="35" y1="62" x2="49" y2="62" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
{SVG_END}'''

# 05 — Extreme Cold
icons["extreme-cold.svg"] = f'''{svg_open()}
<polyline points="48,20 52,16 56,20 52,24 Z" stroke="{FROST}" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
<line x1="52" y1="13" x2="52" y2="27" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
<line x1="45" y1="20" x2="59" y2="20" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
<polyline points="30,44 34,40 38,44 34,48 Z" stroke="{FROST}" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
<line x1="34" y1="37" x2="34" y2="51" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
<line x1="27" y1="44" x2="41" y2="44" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
<polyline points="60,56 64,52 68,56 64,60 Z" stroke="{FROST}" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
<line x1="64" y1="49" x2="64" y2="63" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
<line x1="57" y1="56" x2="71" y2="56" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
{SVG_END}'''

# 06 — Cloudy
icons["cloudy.svg"] = f'''{svg_open()}
{cloud(48, 42, 1.0, CLOUD_FILL, WHITE, 2.0)}
{SVG_END}'''

# 07 — Mostly Cloudy
icons["mostly-cloudy.svg"] = f'''{svg_open()}
{sun(60, 30, 11, AMBER, 1.8, 5, 18)}
{cloud(44, 46, 1.0, CLOUD_FILL, WHITE, 2.0)}
{SVG_END}'''

# 08 — Partly Cloudy
icons["partly-cloudy.svg"] = f'''{svg_open()}
{sun(62, 30, 12, AMBER, 2.0, 5, 20)}
{cloud(42, 48, 0.85, CLOUD_FILL, WHITE, 1.8)}
{SVG_END}'''

# 09 — Overcast
icons["overcast.svg"] = f'''{svg_open()}
{cloud(50, 34, 0.8, "rgba(160,180,200,0.08)", GRAY, 1.5)}
{cloud(42, 46, 1.0, CLOUD_FILL, WHITE, 2.0)}
{SVG_END}'''

# 10 — Fog
icons["fog.svg"] = f'''{svg_open()}
{cloud(48, 30, 0.7, CLOUD_FILL, WHITE, 1.5)}
{mist_lines(18, 52, 4, GRAY, 1.8)}
{SVG_END}'''

# 11 — Haze
icons["haze.svg"] = f'''{svg_open()}
{mist_lines(14, 32, 5, GRAY, 1.5)}
{SVG_END}'''

# 12 — Light Rain
icons["light-rain.svg"] = f'''{svg_open()}
{cloud(48, 34, 0.85, CLOUD_FILL, WHITE, 1.8)}
{rain_drops(48, 54, 2, CYAN, 1.5, 10)}
{SVG_END}'''

# 13 — Rain
icons["rain.svg"] = f'''{svg_open()}
{cloud(48, 32, 0.9, CLOUD_FILL, WHITE, 2.0)}
{rain_drops(48, 52, 3, BLUE, 1.8, 10)}
{SVG_END}'''

# 14 — Heavy Rain
icons["heavy-rain.svg"] = f'''{svg_open()}
{cloud(48, 30, 0.95, "rgba(100,140,200,0.15)", WHITE, 2.0)}
{heavy_rain_drops(48, 50, BLUE, 2.2)}
{SVG_END}'''

# 15 — Drizzle
icons["drizzle.svg"] = f'''{svg_open()}
{cloud(48, 34, 0.8, CLOUD_FILL, WHITE, 1.8)}
<circle cx="40" cy="58" r="1.2" fill="{CYAN}" opacity="0.8"/>
<circle cx="52" cy="62" r="1.2" fill="{CYAN}" opacity="0.6"/>
<circle cx="46" cy="66" r="1.2" fill="{CYAN}" opacity="0.7"/>
{SVG_END}'''

# 16 — Freezing Rain
icons["freezing-rain.svg"] = f'''{svg_open()}
{cloud(48, 30, 0.85, CLOUD_FILL, WHITE, 1.8)}
<line x1="40" y1="50" x2="39" y2="60" stroke="{BLUE}" stroke-width="1.5" stroke-linecap="round"/>
<line x1="52" y1="50" x2="51" y2="60" stroke="{BLUE}" stroke-width="1.5" stroke-linecap="round"/>
<polyline points="46,58 48,56 50,58 48,60 Z" stroke="{FROST}" stroke-width="1" fill="none"/>
{SVG_END}'''

# 17 — Showers
icons["showers.svg"] = f'''{svg_open()}
{cloud(48, 32, 0.85, CLOUD_FILL, WHITE, 1.8)}
<line x1="38" y1="52" x2="37" y2="60" stroke="{BLUE}" stroke-width="1.5" stroke-linecap="round"/>
<line x1="54" y1="54" x2="53" y2="62" stroke="{BLUE}" stroke-width="1.5" stroke-linecap="round"/>
<line x1="46" y1="56" x2="45" y2="64" stroke="{BLUE}" stroke-width="1.5" stroke-linecap="round"/>
{SVG_END}'''

# 18 — Thunderstorm
icons["thunderstorm.svg"] = f'''{svg_open()}
{cloud(48, 28, 0.9, "rgba(167,139,250,0.1)", WHITE, 2.0)}
{lightning_bolt(48, 42, AMBER, 2.2)}
{SVG_END}'''

# 19 — Thunderstorm + Rain
icons["thunderstorm-rain.svg"] = f'''{svg_open()}
{cloud(48, 26, 0.9, "rgba(167,139,250,0.12)", WHITE, 2.0)}
{lightning_bolt(48, 38, AMBER, 2.2)}
<line x1="34" y1="56" x2="33" y2="64" stroke="{BLUE}" stroke-width="1.5" stroke-linecap="round"/>
<line x1="60" y1="56" x2="59" y2="64" stroke="{BLUE}" stroke-width="1.5" stroke-linecap="round"/>
{SVG_END}'''

# 20 — Severe Thunderstorm
icons["severe-thunderstorm.svg"] = f'''{svg_open()}
{cloud(48, 24, 1.0, "rgba(167,139,250,0.15)", WHITE, 2.2)}
{lightning_bolt(46, 36, AMBER, 2.4)}
<line x1="32" y1="54" x2="31" y2="64" stroke="{BLUE}" stroke-width="1.8" stroke-linecap="round"/>
<line x1="42" y1="54" x2="41" y2="64" stroke="{BLUE}" stroke-width="1.8" stroke-linecap="round"/>
<line x1="58" y1="54" x2="57" y2="64" stroke="{BLUE}" stroke-width="1.8" stroke-linecap="round"/>
<line x1="64" y1="52" x2="63" y2="62" stroke="{BLUE}" stroke-width="1.8" stroke-linecap="round"/>
{SVG_END}'''

# 21 — Squall / Windstorm
icons["squall.svg"] = f'''{svg_open()}
{cloud(48, 30, 0.85, CLOUD_FILL, WHITE, 1.8)}
{wind_curves(28, 52, 3, WHITE, 1.8)}
{SVG_END}'''

# 22 — Windy
icons["windy.svg"] = f'''{svg_open()}
{wind_curves(18, 32, 3, WHITE, 2.0)}
{SVG_END}'''

# 23 — Strong Wind
icons["strong-wind.svg"] = f'''{svg_open()}
{wind_curves(14, 28, 4, WHITE, 2.2)}
{SVG_END}'''

# 24 — Dust Storm
icons["dust-storm.svg"] = f'''{svg_open()}
{wind_curves(18, 32, 3, GRAY, 1.8)}
<circle cx="56" cy="36" r="1.2" fill="{GRAY}" opacity="0.6"/>
<circle cx="62" cy="42" r="1" fill="{GRAY}" opacity="0.5"/>
<circle cx="50" cy="44" r="1.4" fill="{GRAY}" opacity="0.4"/>
<circle cx="58" cy="48" r="1" fill="{GRAY}" opacity="0.5"/>
<circle cx="44" cy="50" r="0.8" fill="{GRAY}" opacity="0.3"/>
{SVG_END}'''

# 25 — Smoke / Poor Air
icons["smoke.svg"] = f'''{svg_open()}
<path d="M20,40 Q30,36 40,40 Q50,44 60,40 Q70,36 80,40" stroke="{GRAY}" stroke-width="1.5" fill="none" opacity="0.5"/>
<path d="M16,50 Q26,46 36,50 Q46,54 56,50 Q66,46 76,50" stroke="{GRAY}" stroke-width="1.5" fill="none" opacity="0.4"/>
<path d="M22,60 Q32,56 42,60 Q52,64 62,60 Q72,56 82,60" stroke="{GRAY}" stroke-width="1.5" fill="none" opacity="0.3"/>
<circle cx="35" cy="45" r="1" fill="{GRAY}" opacity="0.3"/>
<circle cx="55" cy="55" r="1.2" fill="{GRAY}" opacity="0.25"/>
{SVG_END}'''

# 26 — Light Snow
icons["light-snow.svg"] = f'''{svg_open()}
{cloud(48, 32, 0.8, CLOUD_FILL, WHITE, 1.8)}
{snowflakes(48, 54, 2, FROST, 2.5, 12)}
{SVG_END}'''

# 27 — Snow
icons["snow.svg"] = f'''{svg_open()}
{cloud(48, 30, 0.85, CLOUD_FILL, WHITE, 1.8)}
{snowflakes(48, 52, 3, FROST, 2.5, 10)}
{SVG_END}'''

# 28 — Heavy Snow
icons["heavy-snow.svg"] = f'''{svg_open()}
{cloud(48, 28, 0.9, "rgba(186,230,253,0.1)", WHITE, 2.0)}
{snowflakes(36, 50, 3, FROST, 3, 8)}
{snowflakes(54, 58, 2, FROST, 2.5, 8)}
{SVG_END}'''

# 29 — Sleet
icons["sleet.svg"] = f'''{svg_open()}
{cloud(48, 30, 0.85, CLOUD_FILL, WHITE, 1.8)}
<line x1="38" y1="50" x2="37" y2="58" stroke="{BLUE}" stroke-width="1.5" stroke-linecap="round"/>
<circle cx="50" cy="56" r="2" fill="{FROST}"/>
<line x1="58" y1="50" x2="57" y2="58" stroke="{BLUE}" stroke-width="1.5" stroke-linecap="round"/>
<circle cx="44" cy="62" r="2" fill="{FROST}"/>
{SVG_END}'''

# 30 — Blizzard
icons["blizzard.svg"] = f'''{svg_open()}
{cloud(48, 28, 0.85, CLOUD_FILL, WHITE, 1.8)}
{wind_curves(26, 48, 2, WHITE, 1.5)}
{snowflakes(48, 62, 3, FROST, 2, 10)}
{SVG_END}'''

# 31 — Frost
icons["frost.svg"] = f'''{svg_open()}
<polyline points="48,18 52,14 56,18 52,22 Z" stroke="{FROST}" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
<line x1="52" y1="11" x2="52" y2="25" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
<line x1="45" y1="18" x2="59" y2="18" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
<polyline points="30,50 34,46 38,50 34,54 Z" stroke="{FROST}" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
<line x1="34" y1="43" x2="34" y2="57" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
<line x1="27" y1="50" x2="41" y2="50" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
<polyline points="62,54 66,50 70,54 66,58 Z" stroke="{FROST}" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
<line x1="66" y1="47" x2="66" y2="61" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
<line x1="59" y1="54" x2="73" y2="54" stroke="{FROST}" stroke-width="1.2" stroke-linecap="round"/>
{SVG_END}'''

# 32 — Sunrise
icons["sunrise.svg"] = f'''{svg_open()}
<line x1="16" y1="60" x2="80" y2="60" stroke="{GRAY}" stroke-width="1.5" stroke-linecap="round"/>
<path d="M48,60 A14,14 0 0,1 48,32" stroke="{AMBER}" stroke-width="2" fill="none" stroke-linecap="round"/>
<line x1="48" y1="28" x2="48" y2="22" stroke="{AMBER}" stroke-width="1.8" stroke-linecap="round"/>
<line x1="32" y1="40" x2="28" y2="36" stroke="{AMBER}" stroke-width="1.5" stroke-linecap="round"/>
<line x1="64" y1="40" x2="68" y2="36" stroke="{AMBER}" stroke-width="1.5" stroke-linecap="round"/>
{SVG_END}'''

# 33 — Sunset
icons["sunset.svg"] = f'''{svg_open()}
<line x1="16" y1="60" x2="80" y2="60" stroke="{GRAY}" stroke-width="1.5" stroke-linecap="round"/>
<path d="M48,60 A14,14 0 0,0 48,32" stroke="#F97316" stroke-width="2" fill="none" stroke-linecap="round"/>
<line x1="48" y1="28" x2="48" y2="22" stroke="#F97316" stroke-width="1.8" stroke-linecap="round"/>
<line x1="32" y1="40" x2="28" y2="36" stroke="#F97316" stroke-width="1.5" stroke-linecap="round"/>
<line x1="64" y1="40" x2="68" y2="36" stroke="#F97316" stroke-width="1.5" stroke-linecap="round"/>
{SVG_END}'''

# 34 — Clear Night
icons["clear-night.svg"] = f'''{svg_open()}
{moon(44, 38, 16, VIOLET, 2.0)}
<circle cx="66" cy="26" r="1.5" fill="{WHITE}" opacity="0.6"/>
<circle cx="74" cy="36" r="1" fill="{WHITE}" opacity="0.4"/>
<circle cx="68" cy="44" r="1.2" fill="{WHITE}" opacity="0.5"/>
{SVG_END}'''

# 35 — Partly Cloudy Night
icons["partly-cloudy-night.svg"] = f'''{svg_open()}
{moon(58, 28, 12, VIOLET, 1.8)}
{cloud(42, 48, 0.85, CLOUD_FILL, WHITE, 1.8)}
<circle cx="72" cy="22" r="1" fill="{WHITE}" opacity="0.4"/>
<circle cx="76" cy="30" r="0.8" fill="{WHITE}" opacity="0.3"/>
{SVG_END}'''

# 36 — Cloudy Night
icons["cloudy-night.svg"] = f'''{svg_open()}
{moon(60, 28, 10, VIOLET, 1.5)}
{cloud(46, 42, 0.9, CLOUD_FILL, WHITE, 1.8)}
{SVG_END}'''

# 37 — Rainy Night
icons["rainy-night.svg"] = f'''{svg_open()}
{moon(62, 26, 10, VIOLET, 1.5)}
{cloud(46, 34, 0.85, CLOUD_FILL, WHITE, 1.8)}
{rain_drops(46, 52, 2, BLUE, 1.5, 10)}
{SVG_END}'''

# 38 — Thunderstorm Night
icons["thunderstorm-night.svg"] = f'''{svg_open()}
{moon(66, 22, 8, VIOLET, 1.2)}
{cloud(46, 28, 0.85, "rgba(167,139,250,0.1)", WHITE, 1.8)}
{lightning_bolt(46, 40, AMBER, 2.0)}
{SVG_END}'''

# 39 — Unknown
icons["unknown.svg"] = f'''{svg_open()}
<circle cx="48" cy="40" r="16" stroke="{GRAY}" stroke-width="1.8" fill="none" opacity="0.4"/>
<path d="M42,36 Q42,30 48,30 Q54,30 54,36 Q54,40 48,44 L48,48" stroke="{GRAY}" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.5"/>
<circle cx="48" cy="54" r="1.5" fill="{GRAY}" opacity="0.5"/>
{SVG_END}'''


# ── Write all SVG files ──────────────────────────────────────────────────────
for name, svg_content in icons.items():
    path = os.path.join(OUT, name)
    with open(path, "w") as f:
        f.write(svg_content.strip())
    print(f"  OK {name}")

print(f"\nDone! Generated {len(icons)} weather icons in {OUT}")
