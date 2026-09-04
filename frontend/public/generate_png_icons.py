#!/usr/bin/env python3
"""Generate 3D glassmorphism weather icons as PNG using Pillow."""

import os, math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "weather-icons-png")
os.makedirs(OUT, exist_ok=True)

SIZE = 256
CENTER = SIZE // 2


def new_img():
    return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))


def draw_glow(img, cx, cy, r, color, intensity=0.3):
    """Draw a soft radial glow."""
    overlay = new_img()
    d = ImageDraw.Draw(overlay)
    for i in range(r, 0, -2):
        alpha = int(255 * intensity * (i / r) ** 2)
        c = color + (alpha,)
        d.ellipse([cx - i, cy - i, cx + i, cy + i], fill=c)
    img.paste(Image.alpha_composite(Image.new("RGBA", img.size, (0,0,0,0)), overlay), (0,0), overlay)


def draw_sun(draw, cx, cy, r, color=(251,191,36), glow_color=(255,224,102)):
    """Draw a 3D sun with rays and gradient."""
    # Glow
    for i in range(r+16, r, -1):
        alpha = int(40 * (1 - (i - r) / 16))
        draw.ellipse([cx-i, cy-i, cx+i, cy+i], fill=glow_color + (alpha,))
    # Rays
    for i in range(8):
        angle = math.radians(i * 45)
        x1 = cx + (r + 4) * math.cos(angle)
        y1 = cy + (r + 4) * math.sin(angle)
        x2 = cx + (r + 14) * math.cos(angle)
        y2 = cy + (r + 14) * math.sin(angle)
        draw.line([(x1, y1), (x2, y2)], fill=color + (200,), width=5)
    # Body
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=color + (255,), outline=color + (180,), width=2)
    # Highlight
    hr = int(r * 0.35)
    draw.ellipse([cx-hr-4, cy-hr-6, cx+hr-4, cy+hr-6], fill=(255, 255, 255, 70))


def draw_cloud(draw, cx, cy, scale=1.0, fill=(200, 220, 245, 50), outline=(200, 220, 255, 65)):
    """Draw a 3D glassmorphism cloud."""
    s = scale
    # Main body
    draw.ellipse([cx-30*s, cy-13*s, cx+30*s, cy+13*s], fill=fill, outline=outline, width=2)
    # Bumps
    draw.ellipse([cx-12*s, cy-24*s, cx+12*s, cy-0*s], fill=fill, outline=outline, width=2)
    draw.ellipse([cx+2*s, cy-28*s, cx+28*s, cy+0*s], fill=fill, outline=outline, width=2)
    draw.ellipse([cx-8*s, cy-18*s, cx+16*s, cy-2*s], fill=fill)
    # Glass highlight
    draw.ellipse([cx+0*s, cy-26*s, cx+14*s, cy-18*s], fill=(255, 255, 255, 45))


def draw_moon(draw, cx, cy, r, color=(167, 139, 250)):
    """Draw a 3D crescent moon."""
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=color + (220,))
    draw.ellipse([cx+r//3, cy-r-2, cx+r+6, cy+r-2], fill=(10, 17, 40, 230))
    # Highlight
    hr = int(r * 0.25)
    draw.ellipse([cx-hr-2, cy-hr-4, cx+hr-2, cy+hr-4], fill=(255, 255, 255, 50))


def draw_rain_drops(draw, cx, y_start, count=3, spacing=12):
    """Draw 3D rain drops."""
    for i in range(count):
        x = cx - ((count-1) * spacing // 2) + i * spacing
        y = y_start + (i % 2) * 4
        # Drop shape (teardrop)
        draw.polygon([(x, y), (x-4, y+8), (x, y+16), (x+4, y+8)], fill=(100, 180, 255, 200))
        draw.ellipse([x-2, y+2, x+2, y+6], fill=(200, 230, 255, 120))


def draw_snowflakes(draw, cx, y_start, count=3, spacing=12):
    """Draw 3D snowflakes."""
    for i in range(count):
        x = cx - ((count-1) * spacing // 2) + i * spacing
        y = y_start + (i % 2) * 5
        r = 4
        draw.ellipse([x-r, y-r, x+r, y+r], fill=(200, 230, 255, 200), outline=(186, 230, 253, 150), width=1)
        draw.ellipse([x-1, y-2, x+1, y], fill=(255, 255, 255, 100))


def draw_lightning(draw, cx, y_start, color=(253, 224, 138)):
    """Draw 3D lightning bolt."""
    pts = [(cx, y_start), (cx-8, y_start+18), (cx+2, y_start+18),
           (cx-5, y_start+36), (cx+8, y_start+14), (cx-1, y_start+14), (cx+6, y_start)]
    draw.polygon(pts, fill=color + (240,), outline=(245, 158, 11, 150), width=1)
    draw.line([(cx-1, y_start+3), (cx-4, y_start+14)], fill=(255, 255, 255, 90), width=2)


def draw_wind(draw, cx, cy, count=3, color=(200, 220, 255)):
    """Draw wind curves."""
    for i in range(count):
        y = cy + i * 14
        w = 50 - i * 6
        draw.arc([cx, y-10, cx+w, y+10], 180, 360, fill=color + (160 - i*30,), width=4)


def draw_mist(draw, cx, cy, count=3):
    """Draw mist lines."""
    for i in range(count):
        y = cy + i * 12
        w = 60 - i * 6
        x = cx + i * 4
        draw.line([(x, y), (x + w, y)], fill=(200, 210, 225, 120 - i*25), width=3)


# ── Icon generators ──────────────────────────────────────────────────────────

def icon_clear():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_glow(img, CENTER, CENTER-8, 40, (251,191,36), 0.15)
    draw_sun(d, CENTER, CENTER-8, 32)
    return img

def icon_hot():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_glow(img, CENTER, CENTER-16, 50, (245,158,11), 0.12)
    draw_sun(d, CENTER, CENTER-16, 28, (245,158,11), (252,211,77))
    # Heat waves
    for wave_y in [80, 90]:
        pts = [(x, wave_y + 4*math.sin(x/12)) for x in range(40, 220, 4)]
        d.line(pts, fill=(245,158,11,120), width=3)
    return img

def icon_mostly_clear():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_sun(d, 160, 80, 22)
    draw_cloud(d, 120, 140, 0.7)
    return img

def icon_cold():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_glow(img, CENTER-16, CENTER-20, 30, (125,211,252), 0.1)
    draw_sun(d, CENTER-16, CENTER-20, 20, (125,211,252), (186,230,253))
    # Crystal
    cx, cy = CENTER+10, CENTER+30
    for angle in range(0, 360, 60):
        rad = math.radians(angle)
        d.line([(cx, cy), (cx+14*math.cos(rad), cy+14*math.sin(rad))], fill=(125,211,252,160), width=2)
    return img

def icon_extreme_cold():
    img = new_img(); d = ImageDraw.Draw(img)
    for pos in [(CENTER, 40), (60, 120), (190, 140), (CENTER, 180)]:
        cx, cy = pos
        for angle in range(0, 360, 60):
            rad = math.radians(angle)
            d.line([(cx, cy), (cx+12*math.cos(rad), cy+12*math.sin(rad))], fill=(125,211,252,140), width=2)
        d.ellipse([cx-3, cy-3, cx+3, cy+3], fill=(186,230,253,180))
    return img

def icon_cloudy():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, CENTER+4, 1.0)
    return img

def icon_mostly_cloudy():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_sun(d, 170, 70, 22)
    draw_cloud(d, 120, 140, 0.9)
    return img

def icon_partly_cloudy():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_glow(img, 170, 60, 30, (251,191,36), 0.1)
    draw_sun(d, 170, 60, 24)
    draw_cloud(d, 110, 150, 0.75)
    return img

def icon_overcast():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, 140, 80, 0.6, (180,200,225,35), (180,200,225,50))
    draw_cloud(d, 120, 130, 1.0)
    return img

def icon_fog():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 70, 0.6, (200,215,235,35), (200,215,235,50))
    draw_mist(d, 40, 130, 4)
    return img

def icon_haze():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_mist(d, 30, 80, 5)
    return img

def icon_light_rain():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 80, 0.75)
    draw_rain_drops(d, CENTER, 145, 2, 14)
    return img

def icon_rain():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 72, 0.82)
    draw_rain_drops(d, CENTER, 140, 3, 12)
    return img

def icon_heavy_rain():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 65, 0.88, (160,190,230,55), (160,190,230,70))
    draw_rain_drops(d, CENTER-16, 135, 2, 10)
    draw_rain_drops(d, CENTER+16, 145, 2, 10)
    return img

def icon_drizzle():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 78, 0.7)
    for pos in [(108, 155), (148, 165), (128, 172)]:
        d.ellipse([pos[0]-2, pos[1]-2, pos[0]+2, pos[1]+2], fill=(100,180,255,140))
    return img

def icon_freezing_rain():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 72, 0.78)
    draw_rain_drops(d, CENTER-14, 138, 1, 0)
    draw_rain_drops(d, CENTER+14, 138, 1, 0)
    # Ice crystal
    cx, cy = CENTER, 165
    for angle in range(0, 360, 90):
        rad = math.radians(angle)
        d.line([(cx, cy), (cx+8*math.cos(rad), cy+8*math.sin(rad))], fill=(125,211,252,160), width=2)
    return img

def icon_showers():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 78, 0.78)
    draw_rain_drops(d, CENTER, 140, 3, 14)
    return img

def icon_thunderstorm():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_glow(img, CENTER, CENTER, 40, (167,139,250), 0.08)
    draw_cloud(d, CENTER, 62, 0.82, (180,170,220,50), (180,170,220,65))
    draw_lightning(d, CENTER, 105)
    return img

def icon_thunderstorm_rain():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_glow(img, CENTER, CENTER, 40, (167,139,250), 0.08)
    draw_cloud(d, CENTER, 58, 0.82, (180,170,220,50), (180,170,220,65))
    draw_lightning(d, CENTER, 95)
    draw_rain_drops(d, CENTER-30, 145, 1, 0)
    draw_rain_drops(d, CENTER+30, 145, 1, 0)
    return img

def icon_severe_thunderstorm():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_glow(img, CENTER, CENTER, 50, (167,139,250), 0.1)
    draw_cloud(d, CENTER, 52, 0.92, (180,170,220,55), (180,170,220,70))
    draw_lightning(d, CENTER-4, 88)
    for x in [60, 100, 160, 200]:
        draw_rain_drops(d, x, 140, 1, 0)
    return img

def icon_squall():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 65, 0.78, (160,180,220,40), (160,180,220,55))
    draw_wind(d, 50, 140, 3)
    return img

def icon_windy():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_wind(d, 40, 80, 3)
    return img

def icon_strong_wind():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_wind(d, 30, 60, 4, (200, 220, 255))
    return img

def icon_dust_storm():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_wind(d, 40, 80, 3, (180, 160, 130))
    for pos in [(170, 90), (190, 110), (160, 120), (180, 140)]:
        d.ellipse([pos[0]-3, pos[1]-3, pos[0]+3, pos[1]+3], fill=(180,160,130,80))
    return img

def icon_smoke():
    img = new_img(); d = ImageDraw.Draw(img)
    for y in [100, 130, 160]:
        w = 70 - (y-100)//30 * 8
        x = 40 + (y-100)//30 * 8
        d.line([(x, y), (x+w, y)], fill=(160,170,185,80), width=3)
    return img

def icon_light_snow():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 78, 0.72)
    draw_snowflakes(d, CENTER, 150, 2, 16)
    return img

def icon_snow():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 72, 0.8)
    draw_snowflakes(d, CENTER, 145, 3, 12)
    return img

def icon_heavy_snow():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 65, 0.85, (200,225,250,45), (200,225,250,60))
    draw_snowflakes(d, CENTER-16, 140, 3, 10)
    draw_snowflakes(d, CENTER+16, 155, 2, 10)
    return img

def icon_sleet():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 70, 0.78)
    draw_rain_drops(d, CENTER-14, 138, 1, 0)
    draw_snowflakes(d, CENTER+14, 145, 1, 0)
    draw_rain_drops(d, CENTER+14, 160, 1, 0)
    draw_snowflakes(d, CENTER-14, 165, 1, 0)
    return img

def icon_blizzard():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_cloud(d, CENTER, 65, 0.78)
    draw_wind(d, 50, 130, 2, (200, 220, 255))
    draw_snowflakes(d, CENTER, 175, 3, 12)
    return img

def icon_frost():
    img = new_img(); d = ImageDraw.Draw(img)
    for pos in [(CENTER, 50), (65, 120), (190, 140), (CENTER, 190)]:
        cx, cy = pos
        for angle in range(0, 360, 60):
            rad = math.radians(angle)
            d.line([(cx, cy), (cx+10*math.cos(rad), cy+10*math.sin(rad))], fill=(125,211,252,130), width=2)
        d.ellipse([cx-3, cy-3, cx+3, cy+3], fill=(186,230,253,160))
    return img

def icon_sunrise():
    img = new_img(); d = ImageDraw.Draw(img)
    d.line([(40, 175), (216, 175)], fill=(200,210,225,80), width=3)
    d.arc([CENTER-32, 120, CENTER+32, 200], 180, 360, fill=(249,115,22,200), width=4)
    draw_sun(d, CENTER, 160, 14, (249,115,22), (253,230,138))
    d.line([(CENTER, 115), (CENTER, 95)], fill=(249,115,22,180), width=3)
    return img

def icon_sunset():
    img = new_img(); d = ImageDraw.Draw(img)
    d.line([(40, 175), (216, 175)], fill=(200,210,225,80), width=3)
    d.arc([CENTER-32, 120, CENTER+32, 200], 0, 180, fill=(249,115,22,200), width=4)
    draw_sun(d, CENTER, 160, 14, (249,115,22), (253,230,138))
    d.line([(CENTER, 115), (CENTER, 95)], fill=(249,115,22,180), width=3)
    return img

def icon_clear_night():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_moon(d, CENTER, CENTER-10, 30)
    for pos in [(190, 60), (210, 90), (195, 120)]:
        d.ellipse([pos[0]-2, pos[1]-2, pos[0]+2, pos[1]+2], fill=(255,255,255,120))
    return img

def icon_partly_cloudy_night():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_moon(d, 165, 70, 22)
    draw_cloud(d, 115, 150, 0.75)
    for pos in [(200, 55), (210, 72)]:
        d.ellipse([pos[0]-1, pos[1]-1, pos[0]+1, pos[1]+1], fill=(255,255,255,80))
    return img

def icon_cloudy_night():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_moon(d, 168, 65, 20)
    draw_cloud(d, 120, 130, 0.82)
    return img

def icon_rainy_night():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_moon(d, 175, 60, 18)
    draw_cloud(d, 120, 85, 0.78)
    draw_rain_drops(d, 120, 145, 2, 12)
    return img

def icon_thunderstorm_night():
    img = new_img(); d = ImageDraw.Draw(img)
    draw_moon(d, 180, 55, 16)
    draw_cloud(d, 120, 70, 0.78, (180,170,220,45), (180,170,220,60))
    draw_lightning(d, 120, 110)
    return img

def icon_unknown():
    img = new_img(); d = ImageDraw.Draw(img)
    d.ellipse([CENTER-30, CENTER-30, CENTER+30, CENTER+30], fill=(100,116,139,30), outline=(100,116,139,60), width=2)
    d.arc([CENTER-12, CENTER-20, CENTER+12, CENTER+5], 200, 340, fill=(200,210,225,100), width=3)
    d.ellipse([CENTER-2, CENTER+8, CENTER+2, CENTER+12], fill=(200,210,225,100))
    return img


# ── Map icon names to generators ─────────────────────────────────────────────
ICON_MAP = {
    "clear": icon_clear,
    "hot": icon_hot,
    "mostly-clear": icon_mostly_clear,
    "cold": icon_cold,
    "extreme-cold": icon_extreme_cold,
    "cloudy": icon_cloudy,
    "mostly-cloudy": icon_mostly_cloudy,
    "partly-cloudy": icon_partly_cloudy,
    "overcast": icon_overcast,
    "fog": icon_fog,
    "haze": icon_haze,
    "light-rain": icon_light_rain,
    "rain": icon_rain,
    "heavy-rain": icon_heavy_rain,
    "drizzle": icon_drizzle,
    "freezing-rain": icon_freezing_rain,
    "showers": icon_showers,
    "thunderstorm": icon_thunderstorm,
    "thunderstorm-rain": icon_thunderstorm_rain,
    "severe-thunderstorm": icon_severe_thunderstorm,
    "squall": icon_squall,
    "windy": icon_windy,
    "strong-wind": icon_strong_wind,
    "dust-storm": icon_dust_storm,
    "smoke": icon_smoke,
    "light-snow": icon_light_snow,
    "snow": icon_snow,
    "heavy-snow": icon_heavy_snow,
    "sleet": icon_sleet,
    "blizzard": icon_blizzard,
    "frost": icon_frost,
    "sunrise": icon_sunrise,
    "sunset": icon_sunset,
    "clear-night": icon_clear_night,
    "partly-cloudy-night": icon_partly_cloudy_night,
    "cloudy-night": icon_cloudy_night,
    "rainy-night": icon_rainy_night,
    "thunderstorm-night": icon_thunderstorm_night,
    "unknown": icon_unknown,
}

for name, gen_fn in ICON_MAP.items():
    img = gen_fn()
    img = img.filter(ImageFilter.GaussianBlur(radius=0.5))
    path = os.path.join(OUT, f"{name}.png")
    img.save(path, "PNG")
    print(f"  OK {name}.png ({SIZE}x{SIZE})")

print(f"\nDone! Generated {len(ICON_MAP)} PNG weather icons in {OUT}")
