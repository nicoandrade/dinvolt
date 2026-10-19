"use client";
import { Example, ExampleWrapper } from "@/playground/showcase/example";
import { CodeBlock, CodeBlockHeader, CodeBlockTitle, CodeBlockContent, CodeBlockCopyButton } from "@/components/ui/code-block";
const code = "export const greeting = \"Hello, Dinvolt\";";
export default function CodeBlockExample() {return <ExampleWrapper><Example title="Code block"><CodeBlock><CodeBlockHeader><CodeBlockTitle>example.ts</CodeBlockTitle><CodeBlockCopyButton value={code}/></CodeBlockHeader><CodeBlockContent><pre><code>{code}</code></pre></CodeBlockContent></CodeBlock></Example></ExampleWrapper>}
