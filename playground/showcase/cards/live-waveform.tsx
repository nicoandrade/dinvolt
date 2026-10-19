"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
function LiveWaveform({ active, processing }: { active: boolean; processing: boolean; [key: string]: unknown }) {
  return <div aria-label="Example audio waveform" className="flex h-20 items-center justify-center gap-0.5 overflow-hidden">{Array.from({ length: 60 }, (_, index) => <span key={index} className={active || processing ? "w-0.5 rounded-full bg-muted-foreground motion-safe:animate-pulse" : "w-0.5 rounded-full bg-muted-foreground"} style={{ height: `${8 + ((index * 17) % 53)}px`, animationDelay: `${index * 23}ms` }} />)}</div>
}
export function LiveWaveformCard() {
  const [active, setActive] = useState(false)
  const [processing, setProcessing] = useState(true)
  const [mode, setMode] = useState<"static" | "scrolling">("static")

  const handleToggleActive = () => {
    setActive(!active)
    if (!active) {
      setProcessing(false)
    }
  }

  const handleToggleProcessing = () => {
    setProcessing(!processing)
    if (!processing) {
      setActive(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Audio Waveform</CardTitle>
        <CardDescription>
          Interactive waveform preview with sample audio data
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LiveWaveform
          active={active}
          processing={processing}
          height={80}
          barWidth={3}
          barGap={2}
          mode={mode}
          fadeEdges={true}
          barColor="gray"
          historySize={120}
        />
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          size="sm"
          variant={active ? "default" : "outline"}
          onClick={handleToggleActive}
        >
          {active ? "Stop" : "Start"} Listening
        </Button>
        <Button
          size="sm"
          variant={processing ? "default" : "outline"}
          onClick={handleToggleProcessing}
        >
          {processing ? "Stop" : "Start"} Processing
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMode(mode === "static" ? "scrolling" : "static")}
        >
          {mode === "static" ? "Static" : "Scrolling"}
        </Button>
      </CardFooter>
    </Card>
  )
}
