import { redirect } from "next/navigation";
import { getOnlyDay } from "../../lib/queries.ts";

// There is one day, so the Day tab opens it directly.
export default function Days() {
  redirect(`/days/${getOnlyDay().id}`);
}
