import Link from "next/link";
import { acceptSuggestion, approve, approveAll, approveLikeAction, dismissSuggestion, rejectLikeAction, reject, generateIngredients, generateMeal } from "../actions.ts";
import { GenerateForm } from "../ui.tsx";
import { listIngredients, listMeals } from "../../lib/queries.ts";
import { listPendingProposals } from "../../lib/fixes.ts";
import { listLikes } from "../../lib/likes.ts";

export default async function Review({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const suggestions = listPendingProposals();
  const likes = listLikes().filter((l) => l.status === "proposed");
  const ingredients = listIngredients("proposed");
  const meals = listMeals().filter((m) => m.status === "proposed");
  const total = ingredients.length + meals.length;
  return (
    <>
      <h1>Review</h1>
      <p className="lede">Ask for ideas and they wait here. Nothing counts toward a meal or a day until you approve it. Everything proposed is dairy-free.</p>
      <GenerateForm action={generateIngredients} label="Propose ingredients" placeholder="Lean proteins and vegetables for cut days" />
      <GenerateForm action={generateMeal} label="Propose a meal" placeholder="A high-protein breakfast under 500 kcal" />

      {error && <p className="notice-line error" role="alert">{error}</p>}
      {suggestions.length > 0 && (
        <>
          <h2>Suggested changes ({suggestions.length})</h2>
          <div className="items">
            {suggestions.map((p) => (
              <div key={p.id} className="item proposed">
                <div className="row">
                  <h3><Link href={p.versionHref}>{p.versionLabel}</Link></h3>
                  <span className="muted">{p.kind === "generate" ? "refit from another version (replaces this version's own changes)" : p.focus ? `fix for ${p.focus.replaceAll("_", " ")}` : "match targets better"}</span>
                  <span className="grow" />
                  <form action={acceptSuggestion.bind(null, p.id)}><button className="primary">Accept</button></form>
                  <form action={dismissSuggestion.bind(null, p.id)}><button>Dismiss</button></form>
                </div>
                <ul className="change-list">{p.changes.map((c) => <li key={c}>{c}</li>)}</ul>
                <div className="progress-rows">
                  {p.rows.map((r) => (
                    <div key={r.label} className="progress-row">
                      <span>{r.label}</span>
                      <span className="muted">{Math.round((r.before / r.target) * 100)}%</span>
                      <span aria-hidden="true">→</span>
                      <b>{Math.round((r.after / r.target) * 100)}%</b>
                      <span className="muted">of {Math.round(r.target)} {r.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {likes.length > 0 && (
        <>
          <h2>Foods you may like ({likes.length})</h2>
          <div className="items">
            {likes.map((l) => (
              <div key={`${l.ingredientId}-${l.slotName}`} className="item proposed">
                <div className="row">
                  <h3>{l.name}</h3><span className="muted">for {l.slotName}</span>
                  <span className="grow" />
                  <form action={approveLikeAction.bind(null, l.ingredientId, l.slotName)}><button className="primary">Approve</button></form>
                  <form action={rejectLikeAction.bind(null, l.ingredientId, l.slotName)}><button>Reject</button></form>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {total === 0 && suggestions.length === 0 && likes.length === 0 ? (
        <p className="empty">Nothing is waiting for you. Ask for ingredients or a meal above, or ask for a fix from a number on the Day page.</p>
      ) : total === 0 ? null : (
        <>
          <div className="row" style={{ marginTop: 28 }}>
            <span className="muted">{total} waiting</span>
            <form action={approveAll}><button>Approve all {total}</button></form>
          </div>
          {ingredients.length > 0 && <h2>Ingredients ({ingredients.length})</h2>}
          <div className="items">
            {ingredients.map((i) => (
              <div key={i.id} className="item proposed">
                <div className="row">
                  <h3>{i.name}</h3><span className="muted">per {i.serving}</span>
                  <span className="grow" />
                  <form action={approve.bind(null, "ingredient", i.id)}><button className="primary">Approve</button></form>
                  <form action={reject.bind(null, "ingredient", i.id)}><button>Reject</button></form>
                </div>
                <div className="muted">{i.source}</div>
                <div>{Math.round(i.nutrients.calories ?? 0)} kcal · {i.nutrients.protein ?? "?"} g protein · {i.nutrients.carbs ?? "?"} g carbs · {i.nutrients.fat ?? "?"} g fat</div>
              </div>
            ))}
          </div>
          {meals.length > 0 && <h2>Meals ({meals.length})</h2>}
          <div className="items">
            {meals.map((m) => (
              <div key={m.id} className="item proposed">
                <div className="row">
                  <h3><Link href={`/meals/${m.id}`}>{m.name}</Link></h3><span className="muted">{m.typical_slot}</span>
                  <span className="grow" />
                  <form action={approve.bind(null, "meal", m.id)}><button className="primary">Approve</button></form>
                  <form action={reject.bind(null, "meal", m.id)}><button>Reject</button></form>
                </div>
                <div className="muted">{m.items.map((i) => `${i.qty} × ${i.ingredient.name}`).join(" · ")}</div>
                <div>{Math.round(m.totals.calories ?? 0)} kcal · {Math.round(m.totals.protein ?? 0)} g protein</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
