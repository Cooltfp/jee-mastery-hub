import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface MathTextProps {
  children: string;
  className?: string;
}

const MathText = ({ children, className = "" }: MathTextProps) => {
  return (
    <div className={`math-text prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  );
};

export default MathText;
