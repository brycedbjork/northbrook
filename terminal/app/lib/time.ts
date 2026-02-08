const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export function timeAgo(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / MS_PER_MINUTE);
  if (mins < 1) {
    return "just now";
  }
  if (mins < MINUTES_PER_HOUR) {
    return `${mins}m ago`;
  }
  const hrs = Math.floor(mins / MINUTES_PER_HOUR);
  if (hrs < HOURS_PER_DAY) {
    return `${hrs}h ago`;
  }
  return `${Math.floor(hrs / HOURS_PER_DAY)}d ago`;
}
