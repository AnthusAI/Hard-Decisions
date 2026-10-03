// The data file every page was built from, published beside them.
import { data } from "../../lib/site.js";

export function GET() {
  const { prereg, ...published } = data;
  return new Response(JSON.stringify(published, null, 1), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
