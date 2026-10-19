import { Button } from "@/components/ui/button";

const SettingsFormActions = ({
  dirty,
  previewed,
  onDiscard,
}: {
  dirty: boolean;
  previewed: boolean;
  onDiscard: () => void;
}) => {
  let message = "";
  if (dirty) {
    message = "You have unsaved changes.";
  } else if (previewed) {
    message = "Preview updated. Nothing was saved to your application.";
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <output className="text-muted-foreground mr-auto text-sm">
        {message}
      </output>
      <Button
        disabled={!dirty}
        onClick={onDiscard}
        type="button"
        variant="outline"
      >
        Discard changes
      </Button>
      <Button disabled={!dirty} type="submit">
        Preview changes
      </Button>
    </div>
  );
};

export { SettingsFormActions };
