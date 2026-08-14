// Human one-liner: `17:04:22 quake  M6.2  40km SW of Antofagasta, Chile  usgs`
const TTY = process.stdout.isTTY;
const c = (code, s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s) => c("2", s);

const TYPE_COLORS = {
  quake: "33", // yellow
  space_weather: "35", // magenta
  launch: "36", // cyan
  close_approach: "34", // blue
  grb: "31", // red
  gw: "32", // green
  neutrino: "94", // bright blue
};

export function formatEvent(ev) {
  const t = typeof ev.time === "string" ? ev.time.slice(11, 19) : "??:??:??";
  const type = c(TYPE_COLORS[ev.type] ?? "0", ev.type.padEnd(14));
  const mag = ev.magnitude != null ? c("1", `M${ev.magnitude}`.padEnd(6)) : "      ";
  return `${dim(t)} ${type} ${mag} ${ev.title}  ${dim(ev.source)}`;
}

export function emit(ev, json) {
  console.log(json ? JSON.stringify(ev) : formatEvent(ev));
}
