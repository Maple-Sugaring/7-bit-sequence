import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { TOUR_STEPS, resolveStep, resumeStep } from './tourSteps';

// Pages the app passes through on its own, where a "paused" card would flash.
const QUIET_PATHS = ['/auth/callback'];
const SPOTLIGHT_PAD = 6;

function findTarget(target) {
  return document.querySelector(`[data-tour="${target}"]`);
}

function sameRect(a, b) {
  if (!a || !b) return a === b;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/**
 * Tracks where the step's `data-tour` element sits on screen. Pages load
 * lazily and fetch their data, so the element may appear a moment after the
 * step does; polling covers that, and scroll/resize keep the spotlight on it.
 */
function useTourTarget(target) {
  const [found, setFound] = useState({ target: null, rect: null });
  const scrolledTo = useRef(null);

  useEffect(() => {
    if (!target) return undefined;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const element = findTarget(target);
      const box = element?.getBoundingClientRect();
      const rect = box && box.width > 0 ? { top: box.top, left: box.left, width: box.width, height: box.height } : null;
      if (rect && scrolledTo.current !== target) {
        scrolledTo.current = target;
        element.scrollIntoView({ block: 'start', behavior: 'instant' });
        document.querySelector('[data-tour-viewport]')?.scrollBy({ top: -88, behavior: 'instant' });
      }
      setFound((prev) => (prev.target === target && sameRect(prev.rect, rect) ? prev : { target, rect }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    const timer = setInterval(schedule, 250);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      clearInterval(timer);
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
    };
  }, [target]);

  // Until the new step's element is found, show nothing rather than the last one.
  return found.target === target ? found.rect : null;
}

function TourCard({ title, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const measure = () => document.documentElement.style.setProperty('--tour-card-height', `${ref.current?.getBoundingClientRect().height ?? 250}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (ref.current) observer?.observe(ref.current);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty('--tour-card-height');
    };
  }, []);
  return (
    <Paper
      ref={ref}
      role="dialog"
      aria-labelledby="tour-title"
      tabIndex={-1}
      elevation={8}
      sx={{
        position: 'fixed',
        zIndex: 1401,
        left: 16,
        right: 16,
        bottom: 84,
        maxHeight: '50dvh',
        overflowY: 'auto',
        p: 2,
        borderTop: '4px solid #F76902',
        outline: 'none',
      }}
    >
      <Box aria-live="polite">
        {title}
        {children}
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
        {actions}
      </Stack>
    </Paper>
  );
}

export function TourOverlay({ index, offset, nodePath, transitioning, goTo, onEnd }) {
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();
  const current = resolveStep(TOUR_STEPS, index, pathname);
  const step = TOUR_STEPS[current] ?? null;
  const rect = useTourTarget(step?.target);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onEnd();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEnd]);

  if (QUIET_PATHS.includes(pathname) || transitioning) return null;

  const endButton = (
    <Button size="small" color="inherit" onClick={onEnd} sx={{ mr: 'auto' }}>
      End tour
    </Button>
  );

  if (!step) {
    return (
      <TourCard
        title={<Typography id="tour-title" variant="h6" component="h2">Tour paused</Typography>}
        actions={
          <>
            {endButton}
            <Button variant="contained" onClick={() => goTo(nodePath && isAuthenticated ? index : resumeStep(TOUR_STEPS, index, isAuthenticated))}>
              Resume
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          This page is not part of the walkthrough. Resume to pick up where you left off.
        </Typography>
      </TourCard>
    );
  }

  // Keep the starting offset throughout the tour, including across sign-in.
  const previous = TOUR_STEPS[current - 1];
  const canGoBack = current > offset && previous != null && !(isAuthenticated && previous.signedOut);
  const last = current === TOUR_STEPS.length - 1;

  const next = () => {
    if (last) onEnd();
    // The page it opens is the next step's page, so the tour follows on its own.
    else if (step.clickToAdvance) findTarget(step.target)?.click();
    else goTo(current + 1);
  };

  return (
    <>
      {rect ? (
        <Box
          aria-hidden
          sx={{
            position: 'fixed',
            zIndex: 1400,
            pointerEvents: 'none',
            top: rect.top - SPOTLIGHT_PAD,
            left: rect.left - SPOTLIGHT_PAD,
            width: rect.width + SPOTLIGHT_PAD * 2,
            height: Math.max(0, Math.min(rect.height + SPOTLIGHT_PAD * 2, (document.querySelector('[data-tour-viewport]')?.getBoundingClientRect().bottom ?? window.innerHeight) - rect.top)),
            borderRadius: 3,
            outline: '3px solid #F76902',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
            transition: 'top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
      ) : null}
      <TourCard
        title={
          <>
            <Typography variant="overline" color="text.secondary">
              Step {current - offset + 1} of {TOUR_STEPS.length - offset}
            </Typography>
            <Typography id="tour-title" variant="h6" component="h2">
              {step.title}
            </Typography>
          </>
        }
        actions={
          <>
            {endButton}
            {canGoBack ? (
              <Button variant="outlined" onClick={() => goTo(current - 1)}>
                Back
              </Button>
            ) : null}
            {step.waitFor ? null : (
              <Button variant="contained" onClick={next}>
                {last ? 'Finish' : 'Next'}
              </Button>
            )}
          </>
        }
      >
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {step.body}
        </Typography>
        {step.waitFor ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
            {step.waitFor}
          </Typography>
        ) : null}
      </TourCard>
    </>
  );
}
