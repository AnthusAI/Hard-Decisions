// Opens a <details> the URL's #fragment points at, and every <details> before printing.
function openFragment() {
  if (!location.hash) return;
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target && target.tagName === "DETAILS") target.open = true;
}
openFragment();
window.addEventListener("hashchange", openFragment);
window.addEventListener("beforeprint", () => document.querySelectorAll("details").forEach((d) => (d.open = true)));
