# AgentFlow Design System — Fonts Specification

> **Primary Sans:** Geist (`"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`)  
> **Telemetry & Code Mono:** Geist Mono / JetBrains Mono (`"Geist Mono", "JetBrains Mono", "Fira Code", monospace`)  
> **Loading Strategy:** Zero layout shift, `font-display: swap`, local system fallbacks  

---

## 1. Webfont Configuration

The application imports Geist via `@import url("https://fonts.cdnfonts.com/css/geist");` with high-performance local fallbacks for instant perceived loading without layout jumps.

```css
@font-face {
  font-family: 'Geist';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}

@font-face {
  font-family: 'Geist Mono';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}
```
