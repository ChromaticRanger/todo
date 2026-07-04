import type { ThemeName } from '../stores/settingsStore'

export interface ThemeConfig {
  name: ThemeName
  label: string
  dark: { bg: string; surface: string; accent: string }
  light: { bg: string; surface: string; accent: string }
}

// Shared by ThemePicker (desktop header) and MobileNav (mobile More sheet) so
// the palette lives in one place.
export const themes: ThemeConfig[] = [
  {
    name: 'midnight',
    label: 'Amethyst',
    dark:  { bg: 'oklch(0.12 0.008 280)', surface: 'oklch(0.18 0.006 280)', accent: 'oklch(0.585 0.233 293)' },
    light: { bg: 'oklch(0.97 0.004 280)', surface: 'oklch(1 0 0)',           accent: 'oklch(0.585 0.233 293)' },
  },
  {
    name: 'slate',
    label: 'Slate',
    dark:  { bg: 'oklch(0.12 0.012 220)', surface: 'oklch(0.18 0.009 220)', accent: 'oklch(0.715 0.143 215)' },
    light: { bg: 'oklch(0.97 0.006 220)', surface: 'oklch(1 0 0)',           accent: 'oklch(0.52 0.143 215)' },
  },
  {
    name: 'forest',
    label: 'Forest',
    dark:  { bg: 'oklch(0.12 0.015 155)', surface: 'oklch(0.17 0.012 155)', accent: 'oklch(0.696 0.17 162)' },
    light: { bg: 'oklch(0.97 0.008 155)', surface: 'oklch(1 0 0)',           accent: 'oklch(0.532 0.157 162)' },
  },
  {
    name: 'sunset',
    label: 'Sunset',
    dark:  { bg: 'oklch(0.13 0.012 55)',  surface: 'oklch(0.19 0.01 55)',   accent: 'oklch(0.769 0.188 70)' },
    light: { bg: 'oklch(0.975 0.007 70)', surface: 'oklch(1 0 0)',           accent: 'oklch(0.555 0.163 63)' },
  },
  {
    name: 'rose',
    label: 'Rose',
    dark:  { bg: 'oklch(0.12 0.01 10)',  surface: 'oklch(0.18 0.008 10)', accent: 'oklch(0.712 0.194 13)' },
    light: { bg: 'oklch(0.97 0.006 10)', surface: 'oklch(1 0 0)',          accent: 'oklch(0.588 0.214 17)' },
  },
  {
    name: 'mono',
    label: 'Mono',
    dark:  { bg: 'oklch(0.12 0 0)', surface: 'oklch(0.18 0 0)', accent: 'oklch(0.92 0 0)' },
    light: { bg: 'oklch(0.97 0 0)', surface: 'oklch(1 0 0)',    accent: 'oklch(0.18 0 0)' },
  },
]
