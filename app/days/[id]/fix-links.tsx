import { proposeFix, proposeForAll } from "../../actions.ts";
import type { VersionKey } from "../../../lib/versions.ts";

// Names the version a form acts on.
const Which = ({ want }: { want: VersionKey }) => (
  <>
    <input type="hidden" name="goal" value={want.goal} />
  </>
);

// Above the nutrients: refit this version, or every version starting from this one.
export function FitBar({ want }: { want: VersionKey }) {
  return (
    <div className="fit-bar">
      <form action={proposeFix}><Which want={want} /><button className="primary">Match targets better</button></form>
      <form action={proposeForAll}><Which want={want} /><button>Match all versions, starting from this one</button></form>
      <span className="muted">Suggestions wait on the Review page until you accept them.</span>
    </div>
  );
}
