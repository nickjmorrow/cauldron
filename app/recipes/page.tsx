import { redirect } from "next/navigation";

// Recipes used to have their own pages; a recipe is now part of its meal's page.
export default function Recipes() {
  redirect("/meals");
}
