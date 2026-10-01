// The core ships its browser modules as plain ESM with no declarations; these
// are the two functions tiles.ts draws its colours from.

declare module 'space-weather/public/drap-colors.js' {
  export function drapNoaaColor(mhz: number): [number, number, number, number]
}

declare module 'space-weather/public/aurora.js' {
  export function auroraRampColor(percent: number): [number, number, number]
}
