import { getContrastRatio } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import { darkTheme, isLargeText, lightTheme, orangeText } from '../src/theme/ritTheme';
import { accessibleBlue, accessibleGreen, accessibleOrange, ritOrange } from '../src/theme/ritColors';
import { cssTokens } from '../src/theme/tokens';

const expectContrast = (foreground, background, minimum = 4.5) =>
  expect(getContrastRatio(foreground, background)).toBeGreaterThanOrEqual(minimum);

describe('accessible themes in both color modes', () => {
  it('retains the light palette and button and map styles used by public pages', () => {
    expect(lightTheme.palette.primary.main).toBe(accessibleOrange);
    expect(lightTheme.palette.success.main).toBe(accessibleGreen);
    expect(lightTheme.palette.info.main).toBe(accessibleBlue);
    expect(lightTheme.palette.brand.main).toBe(ritOrange);
    expect(lightTheme.typography.fontFamily).toContain('Roboto');
    expectContrast(lightTheme.palette.text.disabled, lightTheme.palette.background.paper);
    expect(lightTheme.components.MuiButton.styleOverrides.outlinedPrimary.borderColor).toBe(accessibleOrange);
    expect(lightTheme.components.MuiCssBaseline.styleOverrides['.leaflet-control-attribution a'].color).toBe(accessibleOrange);
  });

  it('keeps the public text-size helpers available and uses the accessible orange for small text', () => {
    expect(isLargeText(24)).toBe(true);
    expect(isLargeText(18.67, 700)).toBe(true);
    expect(isLargeText(18.67, 600)).toBe(false);
    expect(orangeText(16)).toBe(accessibleOrange);
    expect(orangeText(24)).toBe(ritOrange);
    expect(orangeText(24, 400, 'other')).toBe(accessibleOrange);
  });

  for (const [mode, theme] of [['light', lightTheme], ['dark', darkTheme]]) {
    it(`keeps ${mode} text, buttons and chart series readable on their actual surfaces`, () => {
      const tokens = cssTokens[mode];
      expect(tokens['--on-primary']).toBe(theme.palette.primary.contrastText);
      for (const color of ['primary', 'success', 'info']) {
        const palette = theme.palette[color];
        expectContrast(palette.main, theme.palette.background.paper);
        expectContrast(palette.contrastText, palette.main);
      }
      for (const token of ['--chart-text', '--chart-tick']) {
        expectContrast(tokens[token], tokens['--surface']);
      }
      for (const token of ['--chart-blue', '--chart-green', '--chart-contrast', '--chart-purple', '--chart-red', '--chart-orange', '--chart-gray']) {
        expectContrast(tokens[token], tokens['--surface'], 3);
      }
    });
  }
});
