export function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="progress">
      <div className="progress-bar" style={{ width: `${progress}%` }} />
    </div>
  );
}
