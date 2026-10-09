/**
 * Entrance of the dashboard blocks: a short fade-up, staggered by position.
 * Behind `motion-safe:` — whoever asks the system for less motion sees every
 * block already in place. `fill-mode-both` keeps a delayed block hidden until
 * its turn, instead of flashing in and then animating.
 */
export const ENTER_ANIMATION =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 ' +
  'motion-safe:fill-mode-both motion-safe:duration-500 motion-safe:ease-out'

/** Static strings, so Tailwind sees every class. They set only the variable
 * the animation reads: the `delay-*` utility would also delay the element's
 * own transitions (a tile's hover shadow, for one). */
const ENTER_DELAYS = [
  '',
  '[--tw-animation-delay:60ms]',
  '[--tw-animation-delay:120ms]',
  '[--tw-animation-delay:180ms]',
  '[--tw-animation-delay:240ms]',
  '[--tw-animation-delay:300ms]',
] as const

/** Delay class for the block at `step` in the reading order. */
export function enterDelay(step: number): string {
  return ENTER_DELAYS[Math.min(Math.max(step, 0), ENTER_DELAYS.length - 1)]
}
