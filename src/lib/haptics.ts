/** Light haptic — task completion via StatusCircle */
export function hapticLight() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(10);
  }
}

/** Medium haptic — swipe threshold crossing */
export function hapticMedium() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(25);
  }
}
