import { notFound } from "next/navigation";
import { getDay, listIngredients, listMeals, listTargets } from "../../../lib/queries.ts";
import { nearestVersion, parseVersionKey, versionLabel } from "../../../lib/versions.ts";
import { GOALS } from "../../../lib/calculators.ts";
import { BaseSlots } from "./base-slots.tsx";
import { Overview } from "./overview.tsx";
import { SpreadTable } from "./spread-table.tsx";
import { VersionSlots } from "./version-slots.tsx";
import { VersionToggles } from "./version-toggles.tsx";
import { FitBar } from "./fix-links.tsx";
import { LikesPanel } from "./likes-panel.tsx";
import { listLikes } from "../../../lib/likes.ts";
import { supplementTotals } from "../../../lib/supplements.ts";

type Query = { goal?: string; view?: string; notice?: string; error?: string };

const NOTICES: Record<string, string> = {
  nochange: "Nothing to change: this version already fits as well as your foods allow.",
};

export default async function DayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const day = getDay(Number((await params).id));
  if (!day) notFound();
  const query = await searchParams;
  const meals = listMeals().filter((m) => m.status === "approved");
  const mealOptions = meals.map((m) => ({ value: String(m.id), label: m.name, hint: `${Math.round(m.totals.calories ?? 0)} kcal` }));

  const message = query.error ?? (query.notice ? NOTICES[query.notice] : undefined);

  if (query.view === "base") {
    const likeOptions = listIngredients("approved").map((i) => ({ value: String(i.id), label: i.name, hint: i.serving }));
    return (
      <>
        <h1>Day<span className="badge" style={{ verticalAlign: 8 }}>Base day</span></h1>
        <VersionToggles dayId={day.id} versions={day.versions} current="base" />
        <p className="lede">The meals you eat every day. Each version starts from this and drops, resizes or adds foods; open one to see it against its targets.</p>
        {message && <p className={`notice-line${query.error ? " error" : ""}`} role="status">{message}</p>}
        <div className="split">
          <BaseSlots slots={day.slots} mealOptions={mealOptions} />
          <SpreadTable slots={day.slots} supplements={supplementTotals()} />
        </div>
        <LikesPanel slots={day.slots} likes={listLikes()} foodOptions={likeOptions} />
      </>
    );
  }

  // The overview of all six is its own view; otherwise a bare Day opens the default version, and a goal or kind in the URL opens exactly that one.
  if (query.view === "overview") {
    const calories = Object.fromEntries(GOALS.map((g) => [g.value, listTargets(g.value).calories])) as Parameters<typeof Overview>[0]["calories"];
    return (
      <>
        <h1>Day<span className="badge" style={{ verticalAlign: 8 }}>Overview</span></h1>
        <VersionToggles dayId={day.id} versions={day.versions} current="overview" />
        <p className="lede">Your base day in each version on one scale. The dashed outline is the base day; open a version to change it.</p>
        {message && <p className={`notice-line${query.error ? " error" : ""}`} role="status">{message}</p>}
        <Overview day={day} calories={calories} />
      </>
    );
  }
  const asked = GOALS.some((g) => g.value === query.goal);
  const want = asked ? parseVersionKey(query) : (nearestVersion(day.versions) ?? parseVersionKey({}));
  const version = day.versions.find((v) => v.goal === want.goal);
  const foodOptions = [
    ...listIngredients("approved").map((i) => ({ value: `i:${i.id}`, label: i.name, hint: i.serving })),
    ...meals.map((m) => ({ value: `m:${m.id}`, label: `Meal: ${m.name}`, hint: `${Math.round(m.totals.calories ?? 0)} kcal` })),
  ];

  const targets = listTargets(want.goal);
  return (
    <>
      <h1>Day<span className="badge" style={{ verticalAlign: 8 }}>{versionLabel(want)}</span></h1>
      <VersionToggles dayId={day.id} versions={day.versions} current={want} />
      <p className="lede">Your base day with this version's changes, compared with your daily {want.goal} targets. Every variation counts equally, so the numbers are a typical day.</p>
      {message && <p className={`notice-line${query.error ? " error" : ""}`} role="status">{message}</p>}
      <FitBar want={want} />
      <div className="split">
        <VersionSlots base={day.slots} resolved={version?.slots ?? day.slots} adjustments={version?.adjustments ?? []} want={want} foodOptions={foodOptions} />
        <SpreadTable slots={version?.slots ?? day.slots} targets={targets} supplements={supplementTotals()} />
      </div>
    </>
  );
}
