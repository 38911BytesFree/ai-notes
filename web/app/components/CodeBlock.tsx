import { useState } from "react";

interface CodeBlockProps {
  code: string;
  lang?: string;
}

export function CodeBlock({ code, lang }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code", err);
    }
  };

  return (
    <div className="relative my-3 rounded-md bg-gray-900 text-gray-100 overflow-hidden text-sm">
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-800/60 px-4 py-1.5 text-xs text-gray-400">
        <span>{lang || "text"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
