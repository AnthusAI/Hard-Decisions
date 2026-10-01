// /og/<page path>.<hash>.png: one social card per page, drawn at build time.
import { allCards } from "../../lib/cards.js";
import { renderPng } from "../../lib/og.js";

export function getStaticPaths() {
  return allCards().map((card) => ({ params: { card: card.slug }, props: { card } }));
}

export async function GET({ props }) {
  return new Response(await renderPng(props.card), { headers: { "Content-Type": "image/png" } });
}
