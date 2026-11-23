import Link from "next/link";
import type { ReactNode } from "react";

type Links = Map<string, number>; // lower-cased recipe name -> id, for [[name]] links
type Node = { text: string; children: Node[] };

// **bold**, [text](https://...) and [[recipe name]]; everything else is shown as written.
function inline(text: string, links: Links): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\]|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("[[")) {
      const name = part.slice(2, -2);
      const id = links.get(name.toLowerCase());
      return id ? <Link key={i} href={`/recipes/${id}`}>{name}</Link> : <span key={i}>{name}</span>;
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return part;
  });
}

// "- item" lines nest by two spaces of indent; a line that isn't a bullet continues the bullet above it.
function tree(body: string): Node[] {
  const root: Node = { text: "", children: [] };
  const stack: { depth: number; node: Node }[] = [{ depth: -1, node: root }];
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    const bullet = line.match(/^( *)- (.*)$/);
    if (!bullet) {
      const last = stack[stack.length - 1].node;
      if (last === root) root.children.push({ text: line.trim(), children: [] });
      else last.text += "\n" + line.trim();
      continue;
    }
    const depth = Math.floor(bullet[1].length / 2);
    while (stack[stack.length - 1].depth >= depth) stack.pop();
    const node: Node = { text: bullet[2], children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ depth, node });
  }
  return root.children;
}

function List({ nodes, links }: { nodes: Node[]; links: Links }) {
  return (
    <ul>
      {nodes.map((n, i) => (
        <li key={i}>
          {n.text.split("\n").map((line, j) => <span key={j} className="md-line">{inline(line, links)}</span>)}
          {n.children.length > 0 && <List nodes={n.children} links={links} />}
        </li>
      ))}
    </ul>
  );
}

/** A recipe section's body: nested bullets with bold, links and links to other recipes. */
export function Markdown({ body, links }: { body: string; links: Links }) {
  const nodes = tree(body);
  return nodes.length > 0 ? <div className="md"><List nodes={nodes} links={links} /></div> : null;
}
