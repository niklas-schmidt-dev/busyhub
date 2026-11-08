/** Five LEDs lighting up in turn, like a scan across the bar, beside what is happening. */
export function LedLoader({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
      <span aria-hidden className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-info motion-safe:animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
      <span>{label}…</span>
    </div>
  )
}
