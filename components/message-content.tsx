import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SourceLink } from "./source-links";

// Render saved model output without executing HTML or loading remote images.
export function MessageContent({content, className = ""}: {content: string; className?: string}) {
  return <div className={`markdown-content ${className}`.trim()}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: ({href, children}) => <SourceLink url={href}>{children}</SourceLink>,
      img: ({alt}) => <span>{alt || "图片"}</span>,
      table: ({children}) => <div className="markdown-table-scroll" role="region" aria-label="表格（可横向滚动）" tabIndex={0}><table>{children}</table></div>,
    }}>{content}</ReactMarkdown>
  </div>;
}
