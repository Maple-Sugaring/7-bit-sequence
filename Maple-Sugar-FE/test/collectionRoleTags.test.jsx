// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import dayjs from 'dayjs';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import { CollectionHistory } from '../src/components/collection/CollectionHistory';
import { request } from '../src/data/transports/mockTransport';
import * as appThemes from '../src/theme/ritTheme';

afterEach(cleanup);

function entry(EntryID, Submitted_Role, Author) {
  return {
    EntryID,
    Author,
    Submitted_Role,
    Title: `Collected Tree ${EntryID}`,
    Collected_At: dayjs().toISOString(),
    Process_Notes: '',
    Weight_Lb: 20,
    Sugar_Percent: null,
    Ice_Present: false,
    Round_Label: null,
  };
}

describe('collection role tags', () => {
  it('labels each collection with the role its author held when they submitted it', () => {
    render(
      <CollectionHistory
        entries={[entry(1, 'Student', 'Maya Okafor'), entry(2, 'Admin', 'Tom Palmer'), entry(3, 'MSS', 'Sofia Delgado')]}
        loading={false}
      />,
    );
    const card = (title) => within(screen.getByRole('heading', { name: title }).closest('.MuiCard-root'));
    expect(card('Collected Tree 1').getByText('Student')).toBeTruthy();
    expect(card('Collected Tree 2').getByText('Administrator')).toBeTruthy();
    expect(card('Collected Tree 3').getByText('MSS Member')).toBeTruthy();
  });

  it('shows no tag on an entry without a recorded role', () => {
    render(<CollectionHistory entries={[entry(4, null, 'Someone')]} loading={false} />);
    const card = within(screen.getByRole('heading', { name: 'Collected Tree 4' }).closest('.MuiCard-root'));
    for (const label of ['Student', 'Administrator', 'MSS Member']) expect(card.queryByText(label)).toBeNull();
  });

  it.each(Object.values(appThemes).filter((theme) => theme?.palette).map((theme) => [theme.palette.mode, theme]))('uses orange, green, and purple role identifiers in %s mode', (_mode, theme) => {
    render(
      <ThemeProvider theme={theme}>
        <CollectionHistory entries={[entry(1, 'Admin', 'Tom'), entry(2, 'Student', 'Maya'), entry(3, 'MSS', 'Sofia')]} loading={false} />
      </ThemeProvider>,
    );
    for (const [label, background, foreground] of [
      ['Administrator', 'rgb(247, 105, 2)', 'rgb(0, 0, 0)'],
      ['Student', 'rgb(132, 189, 0)', 'rgb(0, 0, 0)'],
      ['MSS Member', 'rgb(125, 85, 199)', 'rgb(255, 255, 255)'],
    ]) {
      const style = getComputedStyle(screen.getByText(label).closest('.MuiChip-root'));
      expect(style.backgroundColor).toBe(background);
      expect(style.color).toBe(foreground);
    }
  });

  it('stamps a submitted collection with the submitter\'s role in the mock API', async () => {
    await request({ method: 'POST', path: '/auth/login', body: { email: 'mo5521@g.rit.edu', password: 'pw' } });
    const saved = await request({
      method: 'POST',
      path: '/collections',
      body: { NodeID: 2, Weight: 40, Sugar_Percent: null, Ice_Present: false, Collected_At: new Date(Date.now() - 3_600_000).toISOString() },
    });
    expect(saved.Entry.Submitted_Role).toBe('Student');
  });
});
