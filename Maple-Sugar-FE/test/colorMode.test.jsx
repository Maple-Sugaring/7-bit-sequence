// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from '@mui/material/styles';
import { ColorModeProvider } from '../src/theme/ColorModeProvider';
import { useColorMode, useColorModeInShell } from '../src/theme/colorMode';

function Toggle() {
  const { mode, toggleMode } = useColorMode();
  const theme = useTheme();
  return <button onClick={toggleMode}>{`${mode}/${theme.palette.mode}`}</button>;
}

function Shell() {
  useColorModeInShell();
  return <Toggle />;
}

const button = () => screen.getByRole('button');
const htmlMode = () => document.documentElement.dataset.colorMode;

beforeEach(() => {
  const saved = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value)),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('color mode', () => {
  it('starts light and toggles the theme and the page attribute', () => {
    render(<ColorModeProvider><Shell /></ColorModeProvider>);
    expect(button().textContent).toBe('light/light');
    expect(htmlMode()).toBe('light');

    fireEvent.click(button());
    expect(button().textContent).toBe('dark/dark');
    expect(htmlMode()).toBe('dark');

    fireEvent.click(button());
    expect(button().textContent).toBe('light/light');
    expect(localStorage.getItem('maple-color-mode')).toBe('light');
  });

  it('restores a saved choice', () => {
    localStorage.setItem('maple-color-mode', 'dark');
    render(<ColorModeProvider><Shell /></ColorModeProvider>);
    expect(button().textContent).toBe('dark/dark');
    expect(htmlMode()).toBe('dark');
  });

  it('keeps pages outside the app shell light', () => {
    localStorage.setItem('maple-color-mode', 'dark');
    render(<ColorModeProvider><Toggle /></ColorModeProvider>);
    expect(button().textContent).toBe('light/light');
    expect(htmlMode()).toBe('light');
  });

  it('goes back to light when the app shell unmounts', () => {
    localStorage.setItem('maple-color-mode', 'dark');
    const { rerender } = render(<ColorModeProvider><Shell /></ColorModeProvider>);
    expect(htmlMode()).toBe('dark');

    rerender(<ColorModeProvider><Toggle /></ColorModeProvider>);
    expect(button().textContent).toBe('light/light');
    expect(htmlMode()).toBe('light');
    expect(localStorage.getItem('maple-color-mode')).toBe('dark');
  });
});
