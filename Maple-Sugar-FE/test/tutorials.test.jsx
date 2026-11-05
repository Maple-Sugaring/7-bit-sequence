// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { can, Role } from '../src/business/permissions';
import { PracticeScreen } from '../src/components/tutorials/PracticeScreens';
import { TUTORIAL_SECTIONS, tutorialsFor } from '../src/components/tutorials/tutorialSteps';
import { canVisit } from '../src/routes/navigation';

let role = Role.STUDENT;
vi.mock('../src/context/auth', () => ({
  useAuth: () => ({ role, can: (capability) => can(role, capability), signOut: vi.fn(async () => {}) }),
}));

const { TutorialsPage } = await import('../src/pages/TutorialsPage');
const { AppNavigation } = await import('../src/components/layout/AppNavigation');

afterEach(cleanup);

const outline = (as) =>
  tutorialsFor(as).map((section) => [section.id, section.tasks.map((task) => `${task.id}:${task.steps.length}`)]);

describe('tutorials by role', () => {
  it('gives a student the Collection and Schedule tutorials without the faculty steps', () => {
    expect(outline(Role.STUDENT)).toEqual([['ui', ['collection:7', 'schedule:4']]]);
  });

  it('gives an MSS member Deploy and both hardware fixes', () => {
    expect(outline(Role.MSS)).toEqual([
      ['ui', ['deploy:8']],
      ['hardware', ['recalibration:8', 'solar:6']],
    ]);
  });

  it('gives an admin everything', () => {
    expect(outline(Role.ADMIN)).toEqual([
      ['ui', ['deploy:8', 'collection:7', 'schedule:6']],
      ['hardware', ['recalibration:8', 'solar:6']],
    ]);
  });

  it('lets every role open the page', () => {
    for (const as of Object.values(Role)) expect(canVisit(as, '/tutorials')).toBe(true);
  });
});

describe('practice screens', () => {
  const steps = TUTORIAL_SECTIONS.flatMap((section) => section.tasks.flatMap((task) => task.steps));

  it('has a screen for every step and draws the spot each step points at', () => {
    for (const step of steps) {
      const { container } = render(<PracticeScreen screen={step.screen} target={step.target} role={Role.ADMIN} />);
      expect(container.firstChild, `${step.title} has no screen`).not.toBeNull();
      if (step.target) {
        expect(container.querySelector(`[data-spot="${step.target}"][data-active="true"]`), `${step.title}`).not.toBeNull();
      }
      cleanup();
    }
  });
});

describe('the Tutorials page', () => {
  function renderPage(as) {
    role = as;
    render(
      <MemoryRouter>
        <TutorialsPage />
      </MemoryRouter>,
    );
  }

  it('steps through a task and on to the next one', () => {
    renderPage(Role.STUDENT);
    expect(screen.queryByRole('group', { name: 'Tutorial section' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Choose the tree' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' }).disabled).toBe(true);

    for (let i = 0; i < 6; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Confirm it saved' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next task' }));
    expect(screen.getByText('Schedule · Step 1 of 4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Confirm it saved' })).toBeTruthy();
  });

  it('switches to the hardware fixes for a role that has them', () => {
    renderPage(Role.MSS);
    fireEvent.click(screen.getByRole('button', { name: 'Hardware fixes' }));
    expect(screen.getByRole('heading', { name: 'Open the calibration card' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Solar fixes' }));
    expect(screen.getByRole('heading', { name: 'Spot a power problem' })).toBeTruthy();
  });

  it('keeps the practice screen out of reach of the keyboard and screen readers', () => {
    renderPage(Role.ADMIN);
    expect(document.querySelector('.practice-screen').hasAttribute('inert')).toBe(true);
  });
});

describe('the Tutorials link', () => {
  it('sits right above Log out for every role', () => {
    for (const as of Object.values(Role)) {
      role = as;
      render(
        <MemoryRouter>
          <AppNavigation />
        </MemoryRouter>,
      );
      const account = screen.getAllByRole('navigation', { name: 'Account' })[0];
      const items = [...account.querySelectorAll('a, button')].map((item) => item.textContent);
      expect(items.slice(-2), as).toEqual(['Tutorials', 'Log out']);
      cleanup();
    }
  });
});
