/**
 * A solid fill on a gray track. The stock progress bar paints the whole track
 * in a pale tint of the same color, which reads as a full bar.
 */
export function MeterBar({ percent, color }) {
  const width = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div
      style={{
        marginTop: 8,
        height: 10,
        borderRadius: 5,
        background: 'rgba(0, 0, 0, 0.12)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${width}%`,
          height: '100%',
          borderRadius: 5,
          background: color,
        }}
      />
    </div>
  );
}
