// The only script every page runs: open a <details> the URL's #fragment points at, and open every
// <details> before printing. The pages and their charts are static HTML.
function openFragment() {
  if (!location.hash) return;
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target && target.tagName === "DETAILS") target.open = true;
}
openFragment();
window.addEventListener("hashchange", openFragment);
window.addEventListener("beforeprint", () => document.querySelectorAll("details").forEach((d) => (d.open = true)));
