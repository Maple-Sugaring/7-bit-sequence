import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { PageHeader } from '../components/common/PageHeader';
import { PracticeScreen } from '../components/tutorials/PracticeScreens';
import { rolesLabel, tutorialsFor } from '../components/tutorials/tutorialSteps';
import { useAuth } from '../context/auth';

/** Step text with `backticks` shown as code. */
function StepText({ text }) {
  return text.split('`').map((part, index) => (index % 2 ? <code key={index}>{part}</code> : part));
}

/** True when a click landed on the highlighted spot of the practice screen. */
function hitsSpot(frame, event) {
  const spot = frame?.querySelector('.practice-spot[data-active="true"]');
  if (!spot) return false;
  const box = spot.getBoundingClientRect();
  return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
}

export function TutorialsPage() {
  const { role } = useAuth();
  const sections = tutorialsFor(role);
  const [position, setPosition] = useState({ section: 0, task: 0, step: 0 });
  const frameRef = useRef(null);
  const [overSpot, setOverSpot] = useState(false);

  const section = sections[Math.min(position.section, sections.length - 1)];
  if (!section) {
    return <PageHeader title="Tutorials" subtitle="There are no tutorials for your role yet." />;
  }
  const tasks = section.tasks;
  const task = tasks[Math.min(position.task, tasks.length - 1)];
  const steps = task.steps;
  const stepIndex = Math.min(position.step, steps.length - 1);
  const step = steps[stepIndex];
  const taskIndex = tasks.indexOf(task);
  const isFirst = taskIndex === 0 && stepIndex === 0;
  const isLast = taskIndex === tasks.length - 1 && stepIndex === steps.length - 1;
  const endOfTask = stepIndex === steps.length - 1;

  const move = (delta) => {
    setOverSpot(false);
    setPosition((current) => {
      let nextTask = taskIndex;
      let nextStep = stepIndex + delta;
      if (nextStep >= steps.length) {
        if (taskIndex === tasks.length - 1) return current;
        nextTask += 1;
        nextStep = 0;
      } else if (nextStep < 0) {
        if (taskIndex === 0) return current;
        nextTask -= 1;
        nextStep = tasks[nextTask].steps.length - 1;
      }
      return { ...current, task: nextTask, step: nextStep };
    });
  };

  const chooseSection = (_event, value) => {
    if (value == null) return;
    setOverSpot(false);
    setPosition({ section: sections.findIndex((item) => item.id === value), task: 0, step: 0 });
  };

  const chooseTask = (index) => {
    setOverSpot(false);
    setPosition((current) => ({ ...current, task: index, step: 0 }));
  };

  return (
    <>
      <PageHeader
        title="Tutorials"
        subtitle="Practice each task on a sample screen, one step at a time. You see the steps for your role."
      />

      {sections.length > 1 ? (
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={section.id}
          onChange={chooseSection}
          aria-label="Tutorial section"
          className="tutorial-sections"
        >
          {sections.map((item) => (
            <ToggleButton key={item.id} value={item.id}>
              {item.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      ) : null}
      <Typography color="text.secondary" sx={{ mt: 1.5, mb: 2 }}>
        {section.description}
      </Typography>

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 3 }} role="group" aria-label="Tasks">
        {tasks.map((item, index) => (
          <Chip
            key={item.id}
            label={item.label}
            color="primary"
            variant={index === taskIndex ? 'filled' : 'outlined'}
            onClick={() => chooseTask(index)}
            aria-pressed={index === taskIndex}
            sx={{ fontWeight: 600, minHeight: 36, px: 0.5 }}
          />
        ))}
      </Stack>

      <div className="tutorial-layout">
        <Card component="section" aria-labelledby="tutorial-step-title" className="tutorial-step">
          <CardContent>
            <Typography variant="body2" color="text.secondary" aria-live="polite">
              {task.label} · Step {stepIndex + 1} of {steps.length}
            </Typography>
            <Typography id="tutorial-step-title" variant="h6" component="h2" sx={{ mt: 0.5, mb: 1 }}>
              {step.title}
            </Typography>
            <Chip size="small" variant="outlined" label={rolesLabel(step.capability)} sx={{ mb: 1.5 }} />
            <Typography sx={{ mb: 2 }}>
              <StepText text={step.body} />
            </Typography>
            <LinearProgress
              variant="determinate"
              value={((stepIndex + 1) / steps.length) * 100}
              aria-label={`${task.label} progress`}
              sx={{ height: 8, borderRadius: 999, mb: 2 }}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => move(-1)} disabled={isFirst} sx={{ flex: 1 }}>
                Back
              </Button>
              <Button variant="contained" onClick={() => move(1)} disabled={isLast} sx={{ flex: 1 }}>
                {isLast ? 'Finished' : endOfTask ? 'Next task' : 'Next'}
              </Button>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              {step.target ? 'Click the highlighted spot on the practice screen, or use Next.' : 'Nothing to click on this one. Use Next.'}
            </Typography>
          </CardContent>
        </Card>

        <Box
          ref={frameRef}
          className="practice-frame"
          data-over-spot={overSpot ? 'true' : undefined}
          onClick={(event) => {
            if (step.target && hitsSpot(frameRef.current, event)) move(1);
          }}
          onMouseMove={(event) => setOverSpot(Boolean(step.target) && hitsSpot(frameRef.current, event))}
          onMouseLeave={() => setOverSpot(false)}
        >
          <Typography variant="caption" className="practice-label">
            Practice screen · sample data
          </Typography>
          {/* A drawing of the app: nothing in it can be focused or used. */}
          <Box inert className="practice-screen" key={`${section.id}-${task.id}-${stepIndex}`}>
            <PracticeScreen screen={step.screen} target={step.target} role={role} />
          </Box>
        </Box>
      </div>
    </>
  );
}
