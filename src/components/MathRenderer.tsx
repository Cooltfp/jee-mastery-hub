import React, { useMemo } from "react";
import katex from "katex";

interface MathRendererProps {
  children: string;
  className?: string;
}

const CMDS = [
  "frac","dfrac","tfrac","sqrt","cbrt",
  "alpha","beta","gamma","delta","epsilon","varepsilon",
  "zeta","eta","theta","vartheta","iota","kappa",
  "lambda","mu","nu","xi","pi","varpi",
  "rho","varrho","sigma","varsigma","tau","upsilon",
  "phi","varphi","chi","psi","omega",
  "Alpha","Beta","Gamma","Delta","Epsilon",
  "Zeta","Eta","Theta","Iota","Kappa",
  "Lambda","Mu","Nu","Xi","Pi",
  "Rho","Sigma","Tau","Upsilon","Phi",
  "Chi","Psi","Omega",
  "times","div","cdot","pm","mp","leq","geq","neq",
  "approx","equiv","propto","sim","simeq",
  "infty","partial","nabla","forall","exists",
  "rightarrow","leftarrow","Rightarrow","Leftarrow",
  "sum","prod","int","oint","iint","iiint",
  "lim","log","ln","sin","cos","tan","sec","csc","cot",
  "arcsin","arccos","arctan",
  "vec","hat","bar","overline","underline","dot","ddot",
  "tilde","widehat","widetilde",
  "text","textbf","mathrm","mathbf","mathit","mathcal","mathbb",
  "left","right","big","Big","bigg","Bigg",
  "binom","tbinom","dbinom","boxed",
  "displaystyle","quad","qquad",
  "langle","rangle","lfloor","rfloor","lceil","rceil",
  "degree","circ","angle","triangle",
  "therefore","because","ldots","cdots",
  "begin","end",
].sort((a, b) => b.length - a.length);

function restoreBackslashes(text: string): string {
  let r = text;
  for (const cmd of CMDS) {
    const re = new RegExp(`(?<!\\\\)\\b(${cmd})(?=[{\\s^_\\(\\[]|$)`, "g");
    r = r.replace(re, `\\${cmd}`);
  }
  return r;
}

function k(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex.trim(), {
      throwOnError: false,
      displayMode: display,
      trust: true,
      strict: false,
    });
  } catch {
    return escapeHtml(latex);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function hasLatex(t: string): boolean {
  return /\\[a-zA-Z]+/.test(t) || /\{[^}]*\}/.test(t);
}

function renderBareLatex(text: string): string {
  let r = text;
  r = r.replace(
    /(\\(?:frac|dfrac|tfrac|binom|tbinom|dbinom)\{[^}]*\}\{[^}]*\})/g,
    (m) => k(m, false)
  );
  r = r.replace(
    /(\\(?:sqrt|overline|underline|hat|vec|bar|tilde|dot|ddot|widehat|widetilde|text|mathrm|mathbf|mathit|mathcal|mathbb|boxed)\{[^}]*\})/g,
    (m) => k(m, false)
  );
  r = r.replace(
    /(\\(?:sum|prod|int|oint|iint|iiint|lim)(?:_\{[^}]*\})?(?:\^\{[^}]*\})?)/g,
    (m) => k(m, false)
  );
  r = r.replace(
    /(\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Pi|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega|times|div|cdot|pm|mp|leq|geq|neq|approx|equiv|propto|sim|simeq|infty|partial|nabla|forall|exists|rightarrow|leftarrow|Rightarrow|Leftarrow|therefore|because|ldots|cdots|degree|circ|angle|triangle))(?![a-zA-Z{])/g,
    (m) => k(m, false)
  );
  return r;
}

function renderContent(text: string): string {
  const re = /\$\$([\s\S]*?)\$\$|\$((?:[^$\\]|\\.)*?)\$/g;
  const hasDollars = re.test(text);
  re.lastIndex = 0;

  if (!hasDollars && hasLatex(text)) {
    const stripped = text.replace(/\\[a-zA-Z]+/g, "").replace(/[{}_^]/g, "").trim();
    if (stripped.length < text.length * 0.3) {
      return k(text, false);
    }
    return renderBareLatex(text);
  }

  if (!hasDollars) return escapeHtml(text);

  const parts: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const seg = text.slice(last, m.index);
      parts.push(hasLatex(seg) ? renderBareLatex(seg) : escapeHtml(seg));
    }
    const display = m[1] !== undefined;
    const math = m[1] ?? m[2];
    parts.push(k(math, display));
    last = re.lastIndex;
  }
  if (last < text.length) {
    const seg = text.slice(last);
    parts.push(hasLatex(seg) ? renderBareLatex(seg) : escapeHtml(seg));
  }
  return parts.join("");
}

const MathRenderer: React.FC<MathRendererProps> = ({ children, className = "" }) => {
  const html = useMemo(() => {
    if (!children) return "";
    const restored = restoreBackslashes(children);
    return renderContent(restored);
  }, [children]);

  return (
    <span
      className={className}
      style={{ lineHeight: 1.8 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default MathRenderer;
