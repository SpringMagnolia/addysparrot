export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0:00';
  }

  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatRange(start: number, end: number): string {
  return `${formatTime(start)} - ${formatTime(end)}`;
}
