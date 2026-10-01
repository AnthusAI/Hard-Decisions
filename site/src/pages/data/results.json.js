// The data file every page was built from, published beside them, with the prediction verdicts.
import { data } from "../../lib/site.js";
import { predictions } from "../../lib/predictions.js";

export function GET() {
  const body = JSON.stringify({ ...data, predictions: predictions() }, null, 1);
  return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
