"use client";

import { useState } from "react";

import { FieldLegend, FieldSet } from "@/components/ui/field";
import {
  RadioGroupInline,
  RadioGroupInlineItem,
} from "@/components/ui/radio-group-inline";
import { Example, ExampleWrapper } from "@/playground/showcase/example";

export default function SelectionExample() {
  const [value, setValue] = useState("standard");
  return (
    <ExampleWrapper className="md:grid-cols-1">
      <Example title="Inline choices" className="p-4 sm:p-6">
        <form className="w-full">
          <FieldSet>
            <FieldLegend id="delivery-label" variant="label">
              Delivery
            </FieldLegend>
            <RadioGroupInline
              aria-labelledby="delivery-label"
              name="delivery"
              value={value}
              onValueChange={setValue}
            >
              <RadioGroupInlineItem value="standard">
                Standard
              </RadioGroupInlineItem>
              <RadioGroupInlineItem value="express">
                Express
              </RadioGroupInlineItem>
              <RadioGroupInlineItem value="pickup" disabled>
                Pickup
              </RadioGroupInlineItem>
            </RadioGroupInline>
            <output aria-live="polite">{value}</output>
          </FieldSet>
        </form>
      </Example>
      <Example title="Disabled" className="p-4 sm:p-6">
        <RadioGroupInline
          aria-label="Disabled choices"
          defaultValue="standard"
          disabled
        >
          <RadioGroupInlineItem value="standard">Standard</RadioGroupInlineItem>
          <RadioGroupInlineItem value="express">Express</RadioGroupInlineItem>
          <RadioGroupInlineItem value="pickup" disabled>
            Pickup
          </RadioGroupInlineItem>
        </RadioGroupInline>
      </Example>
      <Example title="Read only" className="p-4 sm:p-6">
        <RadioGroupInline
          aria-label="Read only choices"
          defaultValue="express"
          readOnly
        >
          <RadioGroupInlineItem value="standard">Standard</RadioGroupInlineItem>
          <RadioGroupInlineItem value="express">Express</RadioGroupInlineItem>
          <RadioGroupInlineItem value="pickup" disabled>
            Pickup
          </RadioGroupInlineItem>
        </RadioGroupInline>
      </Example>
    </ExampleWrapper>
  );
}
