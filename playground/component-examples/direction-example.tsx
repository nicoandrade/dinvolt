"use client";
import { Example, ExampleWrapper } from "@/playground/showcase/example";
import { DirectionProvider } from "@/components/ui/direction";
import { Input } from "@/components/ui/input";
export default function DirectionExample() {return <ExampleWrapper><Example title="Left to right"><DirectionProvider direction="ltr"><Input aria-label="Left to right example" placeholder="Hello, Dinvolt"/></DirectionProvider></Example><Example title="Right to left"><DirectionProvider direction="rtl"><div dir="rtl"><Input aria-label="Right to left example" placeholder="مرحبا"/></div></DirectionProvider></Example></ExampleWrapper>}
