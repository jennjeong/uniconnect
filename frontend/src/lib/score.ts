// Colors of a match score band, shared by the score ring and the dashboard.
// gradient runs along the ring (lighter at 12 o'clock, deeper at the end);
// text is a deeper shade that stays readable on white (3:1 or more at the
// large sizes it is used at).
export function scoreBand(score: number) {
  if (score >= 95) return { gradient: ["#8fe04a", "#2fcf6a", "#12b48a"], text: "#0e9a5a" }
  if (score >= 90) return { gradient: ["#c8e43a", "#84cf1f", "#3fba4e"], text: "#4a9a1c" }
  if (score >= 85) return { gradient: ["#ffcf3f", "#ffa823", "#ff7f1f"], text: "#d97706" }
  if (score >= 80) return { gradient: ["#ffb347", "#ff8040", "#ff5a36"], text: "#e8590c" }
  return { gradient: ["#ff9466", "#ff5f5f", "#ec3d64"], text: "#e03150" }
}
