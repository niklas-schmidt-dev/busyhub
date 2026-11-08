import { cn } from 'cn'
import type { AppEntry } from '../../../../shared/types.ts'

/**
 * The app's 8×8 front icon, scaled up pixel for pixel on a black tile like the bar's LEDs.
 * Without an icon, the first letter in the app's accent stands in; the accent is the app's categorical color.
 */
export function AppIcon({ app, size = 'md' }: { app: AppEntry; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-12 rounded-xl p-2' : 'size-10 rounded-lg p-1.5'
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 select-none place-items-center bg-black shadow-[0_0_0_1px_rgb(255_255_255/0.08)]',
        box,
      )}
    >
      {app.icon ? (
        <img
          src={app.icon}
          alt=""
          width={8}
          height={8}
          className="size-full [image-rendering:pixelated] outline-1 -outline-offset-1 outline-white/10"
        />
      ) : (
        <span className="font-mono text-base leading-none font-bold" style={{ color: app.hub.accent }}>
          {app.name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  )
}
