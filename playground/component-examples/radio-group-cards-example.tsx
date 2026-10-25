"use client";

import { useState } from "react";

import { FieldLegend, FieldSet } from "@/components/ui/field";
import {
  RadioGroupCard,
  RadioGroupCardItem,
} from "@/components/ui/radio-group-cards";
import { Example, ExampleWrapper } from "@/playground/showcase/example";

export default function SelectionExample() {
  const [value, setValue] = useState("standard");
  return (
    <ExampleWrapper className="md:grid-cols-1">
      <Example title="Card choices" className="p-4 sm:p-6">
        <form className="w-full">
          <FieldSet>
            <FieldLegend id="delivery-label" variant="label">
              Delivery
            </FieldLegend>
            <RadioGroupCard
              aria-labelledby="delivery-label"
              name="delivery"
              value={value}
              onValueChange={setValue}
              className="grid sm:grid-cols-3"
            >
              <RadioGroupCardItem value="standard" title="Standard delivery">
                Delivered in three to five business days.
              </RadioGroupCardItem>
              <RadioGroupCardItem value="express" title="Express delivery">
                Delivered on the next business day.
              </RadioGroupCardItem>
              <RadioGroupCardItem value="pickup" title="Store pickup" disabled>
                Currently unavailable.
              </RadioGroupCardItem>
            </RadioGroupCard>
            <output aria-live="polite">{value}</output>
          </FieldSet>
        </form>
      </Example>
      <Example title="Disabled" className="p-4 sm:p-6">
        <RadioGroupCard
          aria-label="Disabled choices"
          defaultValue="standard"
          disabled
        >
          <RadioGroupCardItem value="standard" title="Standard delivery">
            Delivered in three to five business days.
          </RadioGroupCardItem>
          <RadioGroupCardItem value="express" title="Express delivery">
            Delivered on the next business day.
          </RadioGroupCardItem>
          <RadioGroupCardItem value="pickup" title="Store pickup" disabled>
            Currently unavailable.
          </RadioGroupCardItem>
        </RadioGroupCard>
      </Example>
      <Example title="Read only" className="p-4 sm:p-6">
        <RadioGroupCard
          aria-label="Read only choices"
          defaultValue="express"
          readOnly
        >
          <RadioGroupCardItem value="standard" title="Standard delivery">
            Delivered in three to five business days.
          </RadioGroupCardItem>
          <RadioGroupCardItem value="express" title="Express delivery">
            Delivered on the next business day.
          </RadioGroupCardItem>
          <RadioGroupCardItem value="pickup" title="Store pickup" disabled>
            Currently unavailable.
          </RadioGroupCardItem>
        </RadioGroupCard>
      </Example>
    </ExampleWrapper>
  );
}
