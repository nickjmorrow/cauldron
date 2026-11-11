import { allowExceed, proposeFix, proposeForAll } from "../../actions.ts";
import type { VersionKey } from "../../../lib/versions.ts";

// Names the version a form acts on.
const Which = ({ want }: { want: VersionKey }) => (
  <>
    <input type="hidden" name="goal" value={want.goal} />
    <input type="hidden" name="kind" value={want.kind} />
  </>
);

// In the popover of an off-target number: ask for a fix focused on it, or say that being over is okay.
export function FixLinks({ want, nutrient, label, over, canAllow }: { want: VersionKey; nutrient: string; label: string; over: boolean; canAllow: boolean }) {
  return (
    <div className="pop-actions">
      <form action={proposeFix}>
        <Which want={want} /><input type="hidden" name="nutrient" value={nutrient} />
        <button className="primary">Propose a fix for {label}</button>
      </form>
      {over && canAllow && (
        <form action={allowExceed}>
          <Which want={want} /><input type="hidden" name="nutrient" value={nutrient} />
          <button>It's okay to exceed {label}</button>
        </form>
      )}
    </div>
  );
}

// Above the table: refit this version, or every version starting from this one.
export function FitBar({ want }: { want: VersionKey }) {
  return (
    <div className="fit-bar">
      <form action={proposeFix}><Which want={want} /><button className="primary">Match targets better</button></form>
      <form action={proposeForAll}><Which want={want} /><button>Match all versions, starting from this one</button></form>
      <span className="muted">Suggestions wait on the Review page until you accept them.</span>
    </div>
  );
}
