// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFleetNodes } from '../src/business/nodeMapStatus';

const fleetState = { current: null };

vi.mock('../src/services/hooks', () => ({ useFleetMap: () => fleetState.current }));
// Leaflet cannot lay out in jsdom, so the map itself is a stub that reports what it was given.
vi.mock('../src/components/map/FleetMap', () => ({
  FleetMap: ({ nodes, selectedId }) => (
    <div data-testid="fleet-map" data-count={nodes.length} data-selected={String(selectedId)} />
  ),
}));

const { FleetMapPage } = await import('../src/pages/FleetMapPage');
const { FleetMapCard } = await import('../src/components/map/FleetMapCard');
const { FleetNodeList } = await import('../src/components/map/FleetNodeList');
const { FleetMapLegend } = await import('../src/components/map/FleetMapLegend');
const { NodePopupContent } = await import('../src/components/map/NodePopupContent');
const { NodeStatusChip } = await import('../src/components/common/NodeStatusChip');

const NOW = new Date('2026-03-01T12:10:00Z');
const raw = (id, name, stand, overrides = {}) => ({
  NodeID: id,
  Node_Name: name,
  Stand: stand,
  Status_Code: 1,
  Last_Seen: '2026-03-01T12:05:00Z',
  Battery_Percent: 80,
  Signal_Rssi: -70,
  Location: { lat: 43.08 + id / 1000, lon: -77.68 },
  Weight: 12.5,
  Temperature: 33,
  ...overrides,
});
const RAW = [
  raw(1, 'Barn - Tree 1', 'Red Barn'),
  raw(2, 'Barn - Tree 2', 'Red Barn', { Status_Code: 2 }),
  raw(3, 'House - Tree 1', 'Alumni House', { Last_Seen: '2026-03-01T11:00:00Z' }),
  raw(4, 'House - Tree 2', 'Alumni House', { Location: null }),
  raw(5, 'House - Tree 3', 'Alumni House', { Status_Code: 0, Last_Seen: null }),
];
const nodes = () => buildFleetNodes({ nodes: RAW, board: RAW, alerts: [], now: NOW });
const setFleet = (overrides = {}) => {
  fleetState.current = { nodes: nodes(), loading: false, error: null, stale: false, refresh: vi.fn(), ...overrides };
};

const renderPage = (url = '/map') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/map" element={<FleetMapPage />} />
      </Routes>
    </MemoryRouter>,
  );
const map = () => screen.getByTestId('fleet-map');
const listNames = () => within(screen.getByRole('list', { name: 'Nodes' })).queryAllByText(/Tree/).map((el) => el.textContent);

beforeEach(() => setFleet());
afterEach(cleanup);

describe('NodeStatusChip', () => {
  it.each([
    ['online', 'Online'],
    ['stale', 'Stale'],
    ['degraded', 'Degraded'],
    ['maintenance', 'Maintenance'],
    ['offline', 'Offline'],
  ])('%s reads %s and carries a shape glyph', (status, label) => {
    const { container } = render(<NodeStatusChip status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

describe('FleetMapLegend', () => {
  const counts = { online: 2, stale: 1, degraded: 0, maintenance: 0, offline: 1 };
  it('shows a count for every status and the no-location total', () => {
    render(<FleetMapLegend counts={counts} noLocation={3} />);
    expect(screen.getByText('Online 2')).toBeTruthy();
    expect(screen.getByText('Degraded 0')).toBeTruthy();
    expect(screen.getByText('No location 3')).toBeTruthy();
  });
  it('toggles a status filter when interactive', () => {
    const onToggle = vi.fn();
    render(<FleetMapLegend counts={counts} active={new Set(['stale'])} onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: /Stale 1/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Online 2/ }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /Online 2/ }));
    expect(onToggle).toHaveBeenCalledWith('online');
  });
  it('is plain, not clickable, without a handler', () => {
    render(<FleetMapLegend counts={counts} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('NodePopupContent', () => {
  it('lists every node at a shared point, each with its own link', () => {
    const shared = nodes().slice(0, 2);
    render(
      <MemoryRouter>
        <NodePopupContent nodes={shared} />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link', { name: 'Open node' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/nodes/1', '/nodes/2']);
    expect(screen.getByText('Barn - Tree 1')).toBeTruthy();
    expect(screen.getByText('Barn - Tree 2')).toBeTruthy();
  });
  it('explains why a node is degraded and omits a missing temperature', () => {
    const degraded = nodes()[1];
    render(
      <MemoryRouter>
        <NodePopupContent nodes={[{ ...degraded, reading: { Weight: 9, Temperature: null, Ice_Present: false } }]} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Reporting as degraded')).toBeTruthy();
    expect(screen.getByText(/9\.0 lb$/)).toBeTruthy();
  });
});

describe('FleetNodeList', () => {
  const renderList = (props = {}) =>
    render(
      <MemoryRouter>
        <FleetNodeList nodes={nodes()} selectedId={null} onSelect={vi.fn()} {...props} />
      </MemoryRouter>,
    );
  it('orders by urgency and puts unsited nodes in their own group', () => {
    renderList();
    expect(listNames()).toEqual(['Barn - Tree 2', 'House - Tree 1', 'House - Tree 3', 'Barn - Tree 1', 'House - Tree 2']);
    expect(screen.getByText('No location (1)')).toBeTruthy();
  });
  it('keeps the show-on-map button and the open link as siblings, never nested', () => {
    renderList();
    const row = screen.getByRole('button', { name: /Barn - Tree 2, Degraded\. Show on map/ });
    expect(row.querySelector('a, button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open Barn - Tree 2' }).getAttribute('href')).toBe('/nodes/2');
  });
  it('selects on a row click', () => {
    const onSelect = vi.fn();
    renderList({ onSelect });
    fireEvent.click(screen.getByRole('button', { name: /House - Tree 1, Stale/ }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });
  it('links an unsited node straight to its page', () => {
    renderList();
    expect(screen.getByRole('link', { name: /House - Tree 2/ }).getAttribute('href')).toBe('/nodes/4');
  });
  it('says so when nothing matches', () => {
    renderList({ nodes: [] });
    expect(screen.getByText('No nodes match these filters.')).toBeTruthy();
  });
});

describe('FleetMapPage', () => {
  it('counts every status in the legend', () => {
    renderPage();
    expect(screen.getByText('Online 2')).toBeTruthy();
    expect(screen.getByText('Stale 1')).toBeTruthy();
    expect(screen.getByText('Degraded 1')).toBeTruthy();
    expect(screen.getByText('Offline 1')).toBeTruthy();
    expect(screen.getByText('No location 1')).toBeTruthy();
  });
  it('narrows list, counts and map to the site in the URL', () => {
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    renderPage('/map?site=Red%20Barn');
    expect(listNames().sort()).toEqual(['Barn - Tree 1', 'Barn - Tree 2']);
    expect(screen.getByText('Offline 0')).toBeTruthy();
    expect(map().dataset.count).toBe('2');
    delete window.matchMedia;
  });
  it('falls back to all sites for an unknown site in the URL', () => {
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    renderPage('/map?site=Nowhere');
    expect(listNames()).toHaveLength(5);
    delete window.matchMedia;
  });
  it('filters by status chip and by search text', () => {
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Stale 1/ }));
    expect(listNames()).toEqual(['House - Tree 1']);
    fireEvent.click(screen.getByRole('button', { name: /Stale 1/ }));
    fireEvent.change(screen.getByLabelText('Search nodes'), { target: { value: 'barn' } });
    expect(listNames().sort()).toEqual(['Barn - Tree 1', 'Barn - Tree 2']);
    delete window.matchMedia;
  });
  it('ignores a node in the URL that is not a number or has no location', () => {
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    const { unmount } = renderPage('/map?node=abc');
    expect(map().dataset.selected).toBe('null');
    unmount();
    renderPage('/map?node=4');
    expect(map().dataset.selected).toBe('null');
    cleanup();
    renderPage('/map?node=2');
    expect(map().dataset.selected).toBe('2');
    delete window.matchMedia;
  });
  it('shows a spinner while loading', () => {
    setFleet({ nodes: [], loading: true });
    renderPage();
    expect(screen.getByRole('status')).toBeTruthy();
  });
  it('shows an empty state when nothing is deployed', () => {
    setFleet({ nodes: [] });
    renderPage();
    expect(screen.getByText('No nodes deployed yet')).toBeTruthy();
  });
  it('shows the error with a retry when the board never loaded', () => {
    const refresh = vi.fn();
    setFleet({ nodes: [], error: 'Could not reach the server', refresh });
    renderPage();
    expect(screen.getByText(/Could not reach the server/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    expect(refresh).toHaveBeenCalled();
  });
  it('warns, but still shows the nodes, when some data failed to load', () => {
    setFleet({ error: 'alerts failed', stale: true });
    renderPage();
    expect(screen.getByText(/faults or readings may be missing/)).toBeTruthy();
    expect(screen.getByText('Online 2')).toBeTruthy();
  });
});

describe('FleetMapCard', () => {
  const renderCard = () =>
    render(
      <MemoryRouter>
        <FleetMapCard fleet={fleetState.current} />
      </MemoryRouter>,
    );
  it('shows the shared fleet data and links to the full map', async () => {
    renderCard();
    expect(screen.getByText('Degraded 1')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open full map' }).getAttribute('href')).toBe('/map');
    expect((await screen.findByTestId('fleet-map')).dataset.count).toBe('5');
  });
  it('warns about partial data', () => {
    setFleet({ stale: true, error: 'x' });
    renderCard();
    expect(screen.getByText(/faults or readings may be missing/)).toBeTruthy();
  });
  it('shows an error block when there is nothing to draw', () => {
    setFleet({ nodes: [], error: 'down' });
    renderCard();
    expect(screen.getByText(/down/)).toBeTruthy();
  });
});
