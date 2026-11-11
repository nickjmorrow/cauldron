// The ss.fitness Calorie and Macronutrient calculators, chained: profile -> calories -> workout/rest macros.

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "heavy" | "extreme";
export type Goal = "cut" | "maintain" | "bulk";
type Composition = "burn" | "build";

export const ACTIVITY_LEVELS: { value: Activity; label: string; multiplier: number }[] = [
  { value: "sedentary", label: "Little to no exercise", multiplier: 1.2 },
  { value: "light", label: "Minimal exercise (1-3 days/week)", multiplier: 1.375 },
  { value: "moderate", label: "Moderate training (3-5 days/week)", multiplier: 1.55 },
  { value: "heavy", label: "Heavy training (6-7 days/week)", multiplier: 1.725 },
  { value: "extreme", label: "Extreme training (2x/day, daily)", multiplier: 1.9 },
];

export const GOALS: { value: Goal; label: string }[] = [
  { value: "cut", label: "Cut" },
  { value: "maintain", label: "Maintain" },
  { value: "bulk", label: "Bulk" },
];

export type Profile = {
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  workoutDays: number;
};

const GOAL_OFFSET = { cut: -500, maintain: 0, bulk: 500 } as const;
const MIN_CALORIES = 1200;
const KCAL_PER_G = { carbs: 4, protein: 4, fat: 9 } as const;

// Share of calories from carbs, protein, fat on workout days and on rest days.
const SPLITS = {
  burn: { workout: [0.52, 0.15, 0.33], rest: [0.48, 0.14, 0.38] },
  build: { workout: [0.56, 0.14, 0.3], rest: [0.52, 0.14, 0.34] },
} as const;

// Training days stand in for the activity question: 1-3 light, 4-5 moderate, 6-7 heavy.
export function activityForWorkoutDays(days: number): Activity {
  return days <= 3 ? "light" : days <= 5 ? "moderate" : "heavy";
}

export function calorieTargets(p: Pick<Profile, "age" | "sex" | "heightCm" | "weightKg"> & { activity: Activity }) {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  const bmr = base + (p.sex === "male" ? 5 : -161);
  const multiplier = ACTIVITY_LEVELS.find((a) => a.value === p.activity)!.multiplier;
  return { bmr: Math.round(bmr), maintain: Math.round(bmr * multiplier) };
}

export type Macro = { kcal: number; g: number };
export type DayMacros = { calories: number; carbs: Macro; protein: Macro; fat: Macro };

function dayMacros(calories: number, [carbs, protein, fat]: readonly number[]): DayMacros {
  const macro = (share: number, perG: number): Macro => {
    const kcal = Math.round(share * calories);
    return { kcal, g: Math.round(kcal / perG) };
  };
  return { calories, carbs: macro(carbs, KCAL_PER_G.carbs), protein: macro(protein, KCAL_PER_G.protein), fat: macro(fat, KCAL_PER_G.fat) };
}

// Workout days get +10%, rest days -10%; whichever side is off balance moves so the week still averages to `calories`.
export function macroTargets(input: { calories: number; workoutDays: number; composition: Composition }) {
  const { calories: l, workoutDays: e, composition } = input;
  if (l < MIN_CALORIES) throw new Error(`Calories can't go below ${MIN_CALORIES} a day (got ${Math.round(l)}).`);
  const restDays = 7 - e;
  const swing = 0.1 * l;
  const surplus = e * (l + swing) + restDays * (l - swing) - 7 * l;
  let workout = l + swing;
  let rest = l - swing;
  if (surplus > 0) workout -= surplus / e;
  else rest += -surplus / restDays;
  return {
    workout: dayMacros(Math.round(workout), SPLITS[composition].workout),
    rest: dayMacros(Math.round(rest), SPLITS[composition].rest),
  };
}

export function planTargets(p: Profile, goal: Goal) {
  const activity = activityForWorkoutDays(p.workoutDays);
  const { bmr, maintain } = calorieTargets({ ...p, activity });
  const averageCalories = maintain + GOAL_OFFSET[goal];
  const composition = goal === "cut" ? "burn" : "build";
  return { bmr, maintain, activity, averageCalories, macros: macroTargets({ calories: averageCalories, workoutDays: p.workoutDays, composition }) };
}

// The calories, carbs, protein and fat targets (grams, except calories) for every goal, on workout and rest days.
export function goalTargetRows(p: Profile) {
  return GOALS.flatMap(({ value: goal }) => {
    const { macros } = planTargets(p, goal);
    return [
      { goal, nutrient: "calories", workout: macros.workout.calories, rest: macros.rest.calories },
      ...(["carbs", "protein", "fat"] as const).map((n) => ({ goal, nutrient: n, workout: macros.workout[n].g, rest: macros.rest[n].g })),
    ];
  });
}

export function imperialToMetric(i: { feet: number; inches: number; pounds: number }) {
  return { heightCm: (i.feet * 12 + i.inches) * 2.54, weightKg: i.pounds * 0.453592 };
}

export function metricToImperial(m: { heightCm: number; weightKg: number }) {
  const totalInches = m.heightCm / 2.54;
  return { feet: Math.floor(totalInches / 12), inches: Math.round(totalInches % 12), pounds: Math.round(m.weightKg / 0.453592) };
}

// Reads the form (feet, inches and pounds) into a Profile, or says what is wrong with it.
export function parseProfile(form: FormData): { profile: Profile } | { error: string } {
  const num = (k: string) => (String(form.get(k) ?? "").trim() === "" ? NaN : Number(form.get(k)));
  const age = num("age"), feet = num("feet"), inches = num("inches"), pounds = num("pounds"), workoutDays = num("workoutDays");
  const sex = form.get("sex") === "male" || form.get("sex") === "female" ? (form.get("sex") as Sex) : undefined;
  if (!(age >= 15 && age <= 100)) return { error: "Enter your age (15-100)." };
  if (!sex) return { error: "Pick male or female." };
  if (!(feet >= 3 && feet <= 8) || !(inches >= 0 && inches < 12)) return { error: "Enter your height as feet and inches." };
  if (!(pounds >= 70 && pounds <= 700)) return { error: "Enter your weight in pounds." };
  if (!Number.isInteger(workoutDays) || workoutDays < 1 || workoutDays > 7) return { error: "Workout days per week must be 1 to 7." };
  return { profile: { age, sex, ...imperialToMetric({ feet, inches, pounds }), workoutDays } };
}
