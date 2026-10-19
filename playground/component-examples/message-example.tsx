"use client";
import { Example, ExampleWrapper } from "@/playground/showcase/example";
import { MessageGroup, Message, MessageContent, MessageHeader, MessageFooter } from "@/components/ui/message";
import { Bubble } from "@/components/ui/bubble";
export default function MessageExample() {return <ExampleWrapper><Example title="Messages"><MessageGroup><Message align="end"><MessageContent><MessageHeader>You</MessageHeader><Bubble>How do I use Dinvolt?</Bubble><MessageFooter>10:42 AM</MessageFooter></MessageContent></Message><Message><MessageContent><MessageHeader>Assistant</MessageHeader><Bubble>Start with the default components and adapt them to your project.</Bubble><MessageFooter>10:43 AM</MessageFooter></MessageContent></Message></MessageGroup></Example></ExampleWrapper>}
