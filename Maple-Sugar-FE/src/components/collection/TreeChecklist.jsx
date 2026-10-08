import { useMemo } from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';

/** "Alumni House - Tree 1" under an "Alumni House" heading reads better as "Tree 1". */
function shortLabel(tree) {
  const prefix = tree.stand ? `${tree.stand} - ` : '';
  return prefix && tree.label.startsWith(prefix) ? tree.label.slice(prefix.length) : tree.label;
}

/**
 * Lays the trees out in the order the round visits them. A stand with several
 * trees gets a heading and short names. Stands with a single tree would each
 * waste a heading row, so runs of them share one row under their full names.
 */
function layout(trees) {
  const stands = [];
  for (const tree of trees) {
    const key = tree.stand ?? 'Other trees';
    const last = stands[stands.length - 1];
    if (last?.stand === key) last.trees.push(tree);
    else stands.push({ stand: key, trees: [tree] });
  }

  const blocks = [];
  for (const group of stands) {
    if (group.trees.length > 1) {
      blocks.push({ key: group.stand, heading: group.stand, trees: group.trees, short: true });
      continue;
    }
    const previous = blocks[blocks.length - 1];
    if (previous && !previous.heading) previous.trees.push(group.trees[0]);
    else blocks.push({ key: `singles-${group.stand}`, heading: null, trees: [group.trees[0]], short: false });
  }
  return blocks;
}

/**
 * The trees on this round with the ones already logged checked off. Tapping a
 * tree picks it for the form below. Buttons are tall enough to hit with a cold
 * thumb.
 */
export function TreeChecklist({ trees, done, selectedId, onSelect }) {
  const blocks = useMemo(() => layout(trees), [trees]);

  return (
    <Stack spacing={1.5}>
      {blocks.map((block) => (
        <Stack key={block.key} spacing={0.75}>
          {block.heading ? (
            <Typography variant="overline" color="text.secondary">
              {block.heading}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {block.trees.map((tree) => {
              const isDone = done.has(tree.nodeId);
              const isSelected = tree.nodeId === selectedId;
              const label = block.short ? shortLabel(tree) : tree.label;
              return (
                <Button
                  key={tree.nodeId}
                  variant={isSelected ? 'contained' : 'outlined'}
                  color={isDone && !isSelected ? 'success' : 'primary'}
                  onClick={() => onSelect(tree.nodeId)}
                  aria-pressed={isSelected}
                  aria-label={isDone ? `${tree.label}, logged this round` : tree.label}
                  startIcon={isDone ? <CheckCircleIcon /> : <RadioButtonUncheckedIcon />}
                  sx={{ minHeight: 44, textTransform: 'none' }}
                >
                  {label}
                </Button>
              );
            })}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}
