// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ColumnCards } from '../src/components/common/ColumnCards';

afterEach(cleanup);

it('keeps long field values and row actions available in the card layout', () => {
  const edit = vi.fn();
  const email = `${'long-name'.repeat(12)}@example.edu`;
  render(<ColumnCards
    rows={[{ id: 7, name: 'A long account name', email, active: true }]}
    getRowId={(row) => row.id}
    columns={[
      { field: 'name', headerName: 'Name' },
      { field: 'actions', headerName: '', renderCell: ({ row }) => <button onClick={() => edit(row.id)}>Edit account</button> },
      { field: 'email', headerName: 'Email' },
      { field: 'active', headerName: 'Status', valueFormatter: (value) => value ? 'Active' : 'Inactive' },
    ]}
  />);
  expect(screen.getByRole('heading', { name: 'A long account name' })).toBeTruthy();
  expect(screen.getByText(email)).toBeTruthy();
  expect(screen.getByText('Active')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit account' }));
  expect(edit).toHaveBeenCalledWith(7);
});

it('lets users reach records beyond the first page', () => {
  render(<ColumnCards
    rows={Array.from({ length: 25 }, (_, id) => ({ id, name: `Account ${id}` }))}
    getRowId={(row) => row.id}
    columns={[{ field: 'name', headerName: 'Name' }]}
  />);
  expect(screen.queryByRole('heading', { name: 'Account 24' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show more (5 left)' }));
  expect(screen.getByRole('heading', { name: 'Account 24' })).toBeTruthy();
});
