import { GOALS, planTargets } from "../../lib/calculators.ts";
import { getProfile, listTargets } from "../../lib/queries.ts";
import { NUTRIENTS } from "../../lib/nutrients.ts";
import { canTolerate, healthCeilings } from "../../lib/guardrails.ts";
import { listTolerances } from "../../lib/tolerances.ts";
import { saveTolerance } from "../actions.ts";
import { ProfileForm } from "./profile-form.tsx";

const MACROS = ["carbs", "protein", "fat"] as const;

export default async function Targets({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const profile = getProfile();
  const targets = listTargets("bulk"); // a target's direction is the same for every goal
  const tolerances = listTolerances();
  const ceilings = healthCeilings(profile?.weightKg);
  const mayExceed = NUTRIENTS.filter((n) => canTolerate(targets[n.key]) && targets[n.key].daily);
  const limits = NUTRIENTS.filter((n) => targets[n.key]?.type === "no_more_than");
  const plans = profile && GOALS.map((g) => ({ ...g, plan: planTargets(profile, g.value) }));

  return (
    <>
      <h1>Targets</h1>
      <p className="lede">Your body and training days set a maintenance calorie number (the SSF Calorie Calculator). Cut and bulk shift it by 500, and each is split into carbs, protein and fat (the SSF Macronutrient Calculator). That calculator gives workout days more than rest days; your target is their weekly average, so every day eats the same and the week adds up to the same total. Both are saved as your targets whenever you press Calculate, and each version on the Days page is compared with the targets for its goal.</p>
      <ProfileForm key={JSON.stringify(profile)} profile={profile} />

      {plans && profile && (
        <>
          <h2>Your numbers</h2>
          <p className="muted">
            BMR {plans[0].plan.bmr} kcal, maintenance {plans[0].plan.maintain} kcal, {profile.workoutDays} workout day{profile.workoutDays === 1 ? "" : "s"}/week.
          </p>
          {plans.map(({ value, label, plan }) => (
            <section key={value} aria-label={label}>
              <h2>{label} · {plan.daily.calories} kcal a day</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th></th><th>Every day</th></tr></thead>
                  <tbody>
                    <tr>
                      <td>Calories</td>
                      <td>{plan.daily.calories} kcal</td>
                    </tr>
                    {MACROS.map((m) => (
                      <tr key={m}>
                        <td>{m[0].toUpperCase() + m.slice(1)}</td>
                        <td>{plan.daily[m].g} g<span className="pct">{plan.daily[m].kcal} kcal</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
      <h2>Okay to exceed</h2>
      <p className="lede">Say which numbers are fine to go over their target, for example protein. Suggested fixes then stop trying to bring them down. Each has a health ceiling that can't be passed, and a limit you can set lower.</p>
      {error && <p className="notice-line error" role="alert">{error}</p>}
      <div className="tolerances">
        {mayExceed.map((n) => {
          const tolerance = tolerances[n.key];
          return (
            <form key={n.key} action={saveTolerance} className="tol-row">
              <input type="hidden" name="nutrient" value={n.key} />
              <label className="tol-name"><input type="checkbox" name="ok" defaultChecked={!!tolerance} />{n.label}</label>
              <label className="muted">up to <input name="upTo" type="number" step="any" min="0" defaultValue={tolerance?.upTo ?? ""} placeholder="no limit" className="qty" /> {n.unit}</label>
              <span className="muted">{ceilings[n.key] !== undefined ? `health ceiling ${ceilings[n.key]} ${n.unit}` : "no health ceiling"}</span>
              <button>Save</button>
            </form>
          );
        })}
      </div>
      <p className="muted">Never okay to exceed, because they are upper limits: {limits.map((n) => n.label.toLowerCase()).join(", ")}.</p>
    </>
  );
}
