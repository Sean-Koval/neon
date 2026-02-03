# Neon Theme System

This folder contains the color theme definitions for the Neon documentation site.

## Theme Files

- `light.css` - Light mode (soft blues, pinks, clean whites)
- `dark.css` - Dark "neon" mode (dark greys with vibrant neon accents)

## Color Palette

### Light Theme
- Background: Soft blue-white gradients (#f5f7ff → #eef2ff)
- Text: Dark navy (#0f111a)
- Accents: Cyan (#00d7ff), Magenta (#ff3fd2), Lime (#c7ff47)

### Dark Theme (Neon)
- Background: Deep charcoal (#0a0c10 → #12151c)
- Text: Soft white (#e8ecf4)
- Accents: Electric cyan (#00ffff), Hot pink (#ff00aa), Neon green (#39ff14)
- Glow effects for that "neon sign" feel

## Usage

Themes are applied via the `data-theme` attribute on the `<html>` element:
- `data-theme="light"` - Light mode
- `data-theme="dark"` - Dark neon mode

The theme toggle component handles switching and persists preference to localStorage.

## Adding New Themes

1. Create a new CSS file in this folder (e.g., `synthwave.css`)
2. Define all CSS custom properties from the base theme
3. Add the theme option to the ThemeToggle component
