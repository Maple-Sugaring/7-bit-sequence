// RIT brand palette. Values from https://www.rit.edu/brandportal/colors
// Do not substitute Pantone-recommended values for 1505c; RIT publishes its own
// interpreted RGB/HEX for orange.

export const ritOrange = '#F76902';

// https://www.rit.edu/brandportal/web-accessibility-designers
// ritOrange may only be used on text that is >=18.76px AND bold. Anything
// smaller or non-bold must use accessibleOrange instead, which in turn must
// never be used as a solid background.
export const accessibleOrange = '#C75300';

export const white = '#FFFFFF';

/** Login canvas from the original seven-bit-sequence UI. */
export const loginGray = '#f2f2f7';

/** Hairline around outlined inputs on the original login form. */
export const inputBorder = '#D9D9D9';

export const neutral = {
  black: '#000000',
  gray430: '#7C878E',
  gray429: '#A2AAAD',
  gray427: '#D0D3D4',
  warmGray5: '#ACA39A',
  warmGray1: '#D7D2CB',
};

// Accents are for occasional, sparing use only. We map them to semantic roles
// so that alert severity never invents an off-brand color.
export const accent = {
  green: '#84BD00',
  lime: '#C4D600',
  blue: '#009CBD',
  purple: '#7D55C7',
  red: '#DA291C',
  amber: '#F6BE00',
};

// Milo Serif and Neue Haas Grotesk are licensed and not distributable, so the
// stack falls through to the RIT-approved substitutes.
// https://www.rit.edu/brandportal/typography
export const ritSansStack =
  '"Neue Haas Grotesk", "Helvetica Neue", Helvetica, Roboto, Arial, sans-serif';
