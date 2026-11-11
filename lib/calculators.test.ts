import test from "node:test";
import assert from "node:assert/strict";
import { calorieTargets, macroTargets, planTargets, parseProfile, imperialToMetric, activityForWorkoutDays, goalTargetRows } from "./calculators.ts";

// Expected numbers worked out by hand from the ss.fitness calculator scripts.
const man = { age: 40, sex: "male", heightCm: 175, weightKg: 80 } as const;

test("calorie calculator: Mifflin-St Jeor times the activity multiplier", () => {
  const c = calorieTargets({ ...man, activity: "moderate" });
  assert.equal(c.bmr, 1699); // 10*80 + 6.25*175 - 5*40 + 5
  assert.equal(c.maintain, 2633); // 1699 * 1.55
});

test("calorie calculator: women get -161 instead of +5", () => {
  assert.equal(calorieTargets({ ...man, sex: "female", activity: "sedentary" }).bmr, 1533);
});

test("macro calculator: workout days up 10%, rest days down, weekly total kept", () => {
  const m = macroTargets({ calories: 2633, workoutDays: 4, composition: "build" });
  assert.deepEqual(m.workout, { calories: 2830, carbs: { kcal: 1585, g: 396 }, protein: { kcal: 396, g: 99 }, fat: { kcal: 849, g: 94 } });
  assert.deepEqual(m.rest, { calories: 2370, carbs: { kcal: 1232, g: 308 }, protein: { kcal: 332, g: 83 }, fat: { kcal: 806, g: 90 } });
});

test("macro calculator: with few workout days the rest days make up the difference", () => {
  const m = macroTargets({ calories: 2000, workoutDays: 2, composition: "burn" });
  assert.equal(m.workout.calories, 2200);
  assert.equal(m.rest.calories, 1920); // 2000 - 200 + 600/5
});

test("macro calculator: refuses fewer than 1200 calories", () => {
  assert.throws(() => macroTargets({ calories: 1199, workoutDays: 4, composition: "build" }), /1200/);
});

test("plan: cut, maintain and bulk shift calories by 500 and cut uses the fat-loss split", () => {
  const profile = { ...man, workoutDays: 4 } as const;
  assert.equal(planTargets(profile, "maintain").averageCalories, 2633);
  assert.equal(planTargets(profile, "cut").averageCalories, 2133);
  assert.equal(planTargets(profile, "bulk").averageCalories, 3133);
  // Fat-loss split gives workout-day carbs 52%, build/maintain 56%.
  const cut = planTargets(profile, "cut");
  assert.equal(cut.macros.workout.carbs.kcal, Math.round(0.52 * cut.macros.workout.calories));
  const bulk = planTargets(profile, "bulk");
  assert.equal(bulk.macros.workout.carbs.kcal, Math.round(0.56 * bulk.macros.workout.calories));
});

test("activity level comes from workout days", () => {
  assert.deepEqual([1, 3, 4, 5, 6, 7].map(activityForWorkoutDays), ["light", "light", "moderate", "moderate", "heavy", "heavy"]);
});

test("goalTargetRows gives calories and macros for every goal on workout and rest days", () => {
  const rows = goalTargetRows({ ...man, workoutDays: 4 });
  assert.equal(rows.length, 12); // 3 goals x (calories, carbs, protein, fat)
  const find = (goal: string, nutrient: string) => rows.find((r) => r.goal === goal && r.nutrient === nutrient)!;
  assert.deepEqual(find("maintain", "calories"), { goal: "maintain", nutrient: "calories", workout: 2830, rest: 2370 });
  assert.deepEqual(find("maintain", "carbs"), { goal: "maintain", nutrient: "carbs", workout: 396, rest: 308 });
  assert.equal(find("cut", "calories").workout, planTargets({ ...man, workoutDays: 4 }, "cut").macros.workout.calories);
  assert.ok(find("bulk", "calories").workout > find("maintain", "calories").workout);
});

test("imperial inputs convert to metric", () => {
  const m = imperialToMetric({ feet: 5, inches: 9, pounds: 170 });
  assert.equal(Math.round(m.heightCm * 10) / 10, 175.3);
  assert.equal(Math.round(m.weightKg * 10) / 10, 77.1);
});

test("parseProfile reports what is wrong", () => {
  const form = new FormData();
  const set = (o: Record<string, string>) => { for (const [k, v] of Object.entries(o)) form.set(k, v); };
  set({ age: "40", sex: "male", feet: "5", inches: "9", pounds: "170", workoutDays: "4" });
  assert.ok("profile" in parseProfile(form));
  form.set("age", "");
  assert.match((parseProfile(form) as { error: string }).error, /age/i);
  form.set("age", "40"); form.set("workoutDays", "9");
  assert.match((parseProfile(form) as { error: string }).error, /workout days/i);
});
