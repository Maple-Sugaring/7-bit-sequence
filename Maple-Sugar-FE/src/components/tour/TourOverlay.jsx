import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import CloseIcon from '@mui/icons-material/Close';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { TOUR_STEPS, resolveStep, resumeStep } from './tourSteps';

// Pages the app passes through on its own, where a "paused" card would flash.
const QUIET_PATHS = ['/auth/callback'];
const SPOTLIGHT_PAD = 3;

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
  const [found, setFound] = useState({ target: null, rect: null, bounds: null });
  const scrolledTo = useRef(null);

  useEffect(() => {
    if (!target) return undefined;
    let frame = 0;
    let lastDocumentTop = null;
    let controlFrame = 0;
    const measure = () => {
      frame = 0;
      const element = findTarget(target);
      const viewport = document.querySelector('[data-tour-viewport]');
      const area = viewport?.getBoundingClientRect();
      const header = document.querySelector('.app-topbar')?.getBoundingClientRect();
      const top = Math.max(0, area?.top ?? 0, header?.bottom ?? 0) + 8;
      const left = Math.max(0, area?.left ?? 0) + 8;
      const bounds = {
        top, left,
        width: Math.max(0, Math.min(window.innerWidth, area?.right ?? window.innerWidth) - left - 8),
        height: Math.max(0, Math.min(window.innerHeight, area?.bottom ?? window.innerHeight) - top - 8),
      };
      const documentTop = element ? element.getBoundingClientRect().top + (viewport?.scrollTop ?? 0) : null;
      if (element && element.getBoundingClientRect().width > 0 && (scrolledTo.current !== target || (lastDocumentTop != null && Math.abs(documentTop - lastDocumentTop) > 1))) {
        scrolledTo.current = target;
        viewport?.scrollBy({ top: element.getBoundingClientRect().top - top - SPOTLIGHT_PAD, behavior: 'instant' });
      }
      lastDocumentTop = documentTop;
      const box = element?.getBoundingClientRect();
      const rect = box && box.width > 0 ? { top: box.top, left: box.left, width: box.width, height: box.height } : null;
      setFound((prev) => (prev.target === target && sameRect(prev.rect, rect) && sameRect(prev.bounds, bounds) ? prev : { target, rect, bounds }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const reframe = () => {
      scrolledTo.current = null;
      schedule();
    };
    const onControlClick = (event) => {
      if (event.target instanceof Element && event.target.closest('[data-tour-unit]')) {
        clearTimeout(controlFrame);
        controlFrame = setTimeout(reframe, 150);
      }
    };
    document.addEventListener('click', onControlClick, true);
    schedule();
    const timer = setInterval(schedule, 250);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', reframe);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reframe);
    const viewport = document.querySelector('[data-tour-viewport]');
    if (viewport) observer?.observe(viewport);
    return () => {
      document.removeEventListener('click', onControlClick, true);
      clearTimeout(controlFrame);
      clearInterval(timer);
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', reframe);
      observer?.disconnect();
    };
  }, [target]);

  // Until the new step's element is found, show nothing rather than the last one.
  return found.target === target ? found : { rect: null, bounds: null };
}

function TourCard({ title, children, actions, onEnd, progress, total }) {
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
        left: { xs: 8, sm: 16 },
        right: { xs: 8, sm: 16 },
        bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
        maxHeight: '50dvh',
        overflowY: 'auto',
        p: { xs: 1.5, sm: 2 },
        borderTop: '3px solid #F76902',
        borderRadius: 2,
        '& .MuiButton-root': { minHeight: 44, px: 1.5, fontSize: '0.8125rem', lineHeight: 1.25 },
        '& .MuiTypography-h6': { fontSize: { xs: '1.125rem', sm: '1.25rem' }, lineHeight: 1.3, fontWeight: 600 },
        '& .MuiTypography-body2': { fontSize: '0.875rem', lineHeight: 1.45 },
        '& .MuiTypography-overline': { display: 'block', fontSize: '0.625rem', lineHeight: 1.4, letterSpacing: '0.06em', mb: 0.5 },
        outline: 'none',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Box aria-live="polite" sx={{ flex: 1, minWidth: 0 }}>{title}</Box>
        <IconButton aria-label="End tour" onClick={onEnd} sx={{ width: 44, height: 44 }}><CloseIcon /></IconButton>
      </Stack>
      <Box aria-live="polite">{children}</Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center', justifyContent: 'space-between' }}>
        {actions?.[0] ?? actions}
        {progress ? <Typography variant="caption" aria-label={`Step ${progress} of ${total}`}>{progress} / {total}</Typography> : null}
        {actions?.[1]}
      </Stack>
      {progress ? <LinearProgress variant="determinate" value={100 * progress / total} aria-label="Tour progress" sx={{ mt: 1, height: 3, borderRadius: 1 }} /> : null}
    </Paper>
  );
}

export function TourOverlay({ index, offset, nodePath, transitioning, goTo, onEnd }) {
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();
  const current = resolveStep(TOUR_STEPS, index, pathname);
  const step = TOUR_STEPS[current] ?? null;
  const { rect, bounds } = useTourTarget(step?.target);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onEnd();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEnd]);


  if (QUIET_PATHS.includes(pathname) || transitioning) return null;

  if (!step) {
    return (
      <TourCard
        onEnd={onEnd}
        title={<Typography id="tour-title" variant="h6" component="h2">Tour paused</Typography>}
        actions={
          <>
            <Button variant="contained" onClick={() => goTo(nodePath && isAuthenticated ? index : resumeStep(TOUR_STEPS, index, isAuthenticated))}>
              Resume
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Resume to return to your last step.
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
      {rect && bounds ? (
        <Box
          aria-hidden
          data-tour-spotlight-clip
          sx={{
            position: 'fixed',
            zIndex: 1400,
            pointerEvents: 'none',
            top: bounds.top,
            left: bounds.left,
            width: bounds.width,
            height: bounds.height,
            overflow: 'hidden',
          }}
        >
          <Box data-tour-spotlight sx={{
            position: 'absolute',
            top: rect.top - bounds.top - SPOTLIGHT_PAD,
            left: rect.left - bounds.left - SPOTLIGHT_PAD,
            width: rect.width + SPOTLIGHT_PAD * 2,
            height: rect.height + SPOTLIGHT_PAD * 2,
            boxSizing: 'border-box',
            borderRadius: 2,
            border: '2px solid #F76902',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
          }} />
        </Box>
      ) : null}
      <TourCard
        onEnd={onEnd}
        progress={current - offset + 1}
        total={TOUR_STEPS.length - offset}
        title={
          <>
            <Typography id="tour-title" variant="h6" component="h2">
              {step.title}
            </Typography>
          </>
        }
        actions={[
          <Button key="back" variant="outlined" disabled={!canGoBack} onClick={() => goTo(current - 1)}>Back</Button>,
          step.waitFor ? null : <Button key="next" variant="contained" onClick={next}>{last ? 'Finish' : step.clickToAdvance ? 'Skip' : 'Next'}</Button>,
        ]}
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
