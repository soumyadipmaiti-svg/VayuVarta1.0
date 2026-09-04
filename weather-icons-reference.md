# Weather Icons Reference — Meteocons

This document maps weather conditions to their corresponding [Meteocons](https://meteocons.com) icon/animation assets, plus setup and usage instructions. Use this as the source of truth when wiring up weather icons in the app.

## Icon / Animation Mapping

| Condition | Asset URL | Type |
|---|---|---|
| Sun / Clear day (static) | `https://cdn.meteocons.com/3.0.0-next.10/svg/fill/clear-day.svg` | SVG |
| Clear night | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/clear-night.json` | Lottie |
| Mostly clear day | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/mostly-clear-day.json` | Lottie |
| Mostly clear night | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/mostly-clear-night.json` | Lottie |
| Partly cloudy (day) | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/partly-cloudy-day.json` | Lottie |
| Light rain (day) | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/partly-cloudy-day-drizzle.json` | Lottie |
| Partly cloudy (night) | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/partly-cloudy-night.json` | Lottie |
| Light rain (night) | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/partly-cloudy-night.json` | Lottie |
| Overcast | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/overcast.json` | Lottie |
| Extreme rain | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/extreme-rain.json` | Lottie |
| Thunderstorm | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/thunderstorms-rain.json` | Lottie |
| Extreme thunderstorm | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/thunderstorms-extreme-day.json` | Lottie |
| Wind | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/wind.json` | Lottie |

## Alert Icons (keep in a separate "alerts" segment)

| Alert Type | Asset URL | Type |
|---|---|---|
| Weather alert (general) | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/weather-alert.json` | Lottie |
| Cyclone alert | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/cyclone-alert.json` | Lottie |
| Extreme heat alert | `https://cdn.meteocons.com/3.0.0-next.10/lottie/fill/fire-alert.json` | Lottie |

> **Note:** Alert icons should be rendered in a dedicated "alerts" UI segment, separate from the standard condition icons above.

## Requirements

Rendering Lottie files requires a Lottie player, e.g. `lottie-web` (web), `lottie-ios` (iOS), or the equivalent for your platform.

## Installation

```bash
# Base package
npm install @meteocons/lottie

# With lottie-web player (for web apps)
npm install @meteocons/lottie lottie-web
```

## Usage (lottie-web example)

```javascript
import lottie from 'lottie-web';
import clearDayAnimation from '@meteocons/lottie/fill/clear-day.json';

const animation = lottie.loadAnimation({
    container: document.getElementById('weather-icon'),
    animationData: clearDayAnimation,
    renderer: 'svg',    // or 'canvas' for better performance
    loop: true,
    autoplay: true
});

// Control playback
animation.setSpeed(0.5);    // half speed
animation.pause();
animation.play();
animation.destroy();        // clean up when done
```

## CDN Usage (static SVG, no JS install needed)

```html
<!-- Meteocons CDN -->
<img
    src="https://cdn.meteocons.com/latest/svg/fill/clear-day.svg"
    alt="Clear day"
    width="64"
    height="64"
/>

<!-- unpkg -->
<img
    src="https://unpkg.com/@meteocons/svg/fill/clear-day.svg"
    alt="Clear day"
    width="64"
    height="64"
/>

<!-- jsDelivr -->
<img
    src="https://cdn.jsdelivr.net/npm/@meteocons/svg/fill/clear-day.svg"
    alt="Clear day"
    width="64"
    height="64"
/>
```

See the CDN documentation for the full URL structure, Lottie examples, and versioning tips.

## Package Structure

All packages follow the same layout with four icon styles:

```
@meteocons/svg/
├── fill/              Filled, colorful icons with gradients
├── flat/              Flat design — solid colors, no gradients
├── line/              Outline-based, minimal weight
├── monochrome/        Single-color, inherits currentColor
├── manifest.json      Icon metadata and categories
└── index.d.ts         TypeScript type definitions
```

Every style directory contains one file per icon, named by slug:

```
fill/clear-day.svg
fill/rain.svg
fill/snow.svg
fill/thunderstorms-day-rain.svg
```

`@meteocons/svg-static` and `@meteocons/lottie` follow the same structure:
- `@meteocons/svg-static` — contains `.svg` files without SMIL animations
- `@meteocons/lottie` — contains `.json` files (Lottie animation data)

## TypeScript Support

Both packages ship with TypeScript declarations:

```typescript
import type { IconManifest, IconCategory, IconEntry } from '@meteocons/svg';
import manifest from '@meteocons/svg/manifest.json';

// Full type safety
const categories: IconCategory[] = manifest.categories;
const firstIcon: IconEntry = categories[0].icons[0];

console.log(firstIcon.slug);      // "clear-day"
console.log(firstIcon.animated);  // true
```

---

## Notes for the AI Agent

- Use the mapping table above to select the correct icon/animation based on the weather condition returned by the weather API.
- Alerts (weather alert, cyclone alert, extreme heat alert) render separately from regular condition icons.
- Prefer Lottie animations for the main weather display; static SVG (`clear-day.svg`) can be used as a lightweight fallback or for smaller UI elements (e.g., forecast list rows).
- Match day/night variants to the actual local time of the location being displayed.
