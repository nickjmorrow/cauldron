"use client";
import { useActionState } from "react";
import { metricToImperial, type Profile } from "../../lib/calculators.ts";
import { saveProfile } from "../actions.ts";

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, run, pending] = useActionState(saveProfile, null);
  const imperial = profile && metricToImperial(profile);
  return (
    <form action={run} className="profile-form">
      <label>Age<input name="age" type="number" min="15" max="100" defaultValue={profile?.age} required /></label>
      <label>Sex
        <select name="sex" defaultValue={profile?.sex ?? "male"}><option value="male">Male</option><option value="female">Female</option></select>
      </label>
      <label>Height
        <span className="row"><input name="feet" type="number" min="3" max="8" defaultValue={imperial?.feet} aria-label="Feet" required /> ft
          <input name="inches" type="number" min="0" max="11" defaultValue={imperial?.inches} aria-label="Inches" required /> in</span>
      </label>
      <label>Weight<span className="row"><input name="pounds" type="number" min="70" max="700" defaultValue={imperial?.pounds} required /> lbs</span></label>
      <label>Workout days per week<input name="workoutDays" type="number" min="1" max="7" defaultValue={profile?.workoutDays ?? 4} required /></label>
      <div className="row">
        <button className="primary" disabled={pending}>{pending ? "Calculating…" : "Calculate"}</button>
        {state && <span className="field-error" role="alert">{state.message}</span>}
      </div>
    </form>
  );
}
