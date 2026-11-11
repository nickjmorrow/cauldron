"use client";
import { useActionState } from "react";
import { placeIngredients } from "./actions.ts";

export function PlaceForm() {
  const [state, run, pending] = useActionState(placeIngredients, null);
  return (
    <form action={run} className="place-form">
      <div className="row">
        <span className="muted">Place ingredients from your day</span>
        <button className="primary" disabled={pending}>{pending ? "Choosing places…" : "Place ingredients"}</button>
      </div>
      {state && <p className="muted generate-note" role="status">{state.message}</p>}
    </form>
  );
}
