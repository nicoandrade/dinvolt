"use client";
import { Example, ExampleWrapper } from "@/playground/showcase/example";
import { Questionnaire, QuestionnaireItem, QuestionnaireTitle, QuestionnaireDescription, QuestionnaireChoices, QuestionnaireChoice, QuestionnaireActions, QuestionnaireSubmit } from "@/components/ui/questionnaire";
const items = [{name: "plan", required: true, choices: [{value: "personal"}, {value: "team"}]}] as const;
export default function QuestionnaireExample() {
  return <ExampleWrapper><Example title="Questionnaire"><Questionnaire defaultItem="plan" items={items} onSubmit={(event) => event.preventDefault()}><QuestionnaireItem name="plan" required><QuestionnaireTitle>Choose your plan</QuestionnaireTitle><QuestionnaireDescription>Select the option that fits your team.</QuestionnaireDescription><QuestionnaireChoices><QuestionnaireChoice value="personal">Personal</QuestionnaireChoice><QuestionnaireChoice value="team">Team</QuestionnaireChoice></QuestionnaireChoices></QuestionnaireItem><QuestionnaireActions><QuestionnaireSubmit>Continue</QuestionnaireSubmit></QuestionnaireActions></Questionnaire></Example></ExampleWrapper>;
}
