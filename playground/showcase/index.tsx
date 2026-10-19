"use client"

import { ActivateAgentDialog } from "@/playground/showcase/cards/activate-agent-dialog"
import { AnalyticsCard } from "@/playground/showcase/cards/analytics-card"
import { AnomalyAlert } from "@/playground/showcase/cards/anomaly-alert"
import { BarChartCard } from "@/playground/showcase/cards/bar-chart-card"
import { BookAppointment } from "@/playground/showcase/cards/book-appointment"
import { CodespacesCard } from "@/playground/showcase/cards/codespaces-card"
import { ContributionsActivity } from "@/playground/showcase/cards/contributions-activity"
import { Contributors } from "@/playground/showcase/cards/contributors"
import { EnvironmentVariables } from "@/playground/showcase/cards/environment-variables"
import { FeedbackForm } from "@/playground/showcase/cards/feedback-form"
import { FileUpload } from "@/playground/showcase/cards/file-upload"
import { GithubProfile } from "@/playground/showcase/cards/github-profile"
import { IconPreviewGrid } from "@/playground/showcase/cards/icon-preview-grid"
import { InviteTeam } from "@/playground/showcase/cards/invite-team"
import { Invoice } from "@/playground/showcase/cards/invoice"
import { LiveWaveformCard } from "@/playground/showcase/cards/live-waveform"
import { NoTeamMembers } from "@/playground/showcase/cards/no-team-members"
import { NotFound } from "@/playground/showcase/cards/not-found"
import { ObservabilityCard } from "@/playground/showcase/cards/observability-card"
import { PieChartCard } from "@/playground/showcase/cards/pie-chart-card"
import { ReportBug } from "@/playground/showcase/cards/report-bug"
import { ShippingAddress } from "@/playground/showcase/cards/shipping-address"
import { Shortcuts } from "@/playground/showcase/cards/shortcuts"
import { SkeletonLoading } from "@/playground/showcase/cards/skeleton-loading"
import { SleepReport } from "@/playground/showcase/cards/sleep-report"
import { StyleOverview } from "@/playground/showcase/cards/style-overview"
import { TypographySpecimen } from "@/playground/showcase/cards/typography-specimen"
import { UIElements } from "@/playground/showcase/cards/ui-elements"
import { UsageCard } from "@/playground/showcase/cards/usage-card"
import { Visitors } from "@/playground/showcase/cards/visitors"
import { WeeklyFitnessSummary } from "@/playground/showcase/cards/weekly-fitness-summary"

export default function PreviewExample() {
  return (
    <div className="overflow-x-auto overflow-y-hidden bg-muted contain-[paint] [--gap:--spacing(4)] 3xl:[--gap:--spacing(12)] md:[--gap:--spacing(10)] dark:bg-background style-lyra:md:[--gap:--spacing(6)] style-mira:md:[--gap:--spacing(6)]">
      <div className="flex w-full min-w-max justify-center">
        <div
          className="grid w-[2400px] grid-cols-7 items-start gap-(--gap) bg-muted p-(--gap) md:w-[3000px] dark:bg-background style-lyra:md:w-[2600px] style-mira:md:w-[2600px] *:[div]:gap-(--gap)"
          data-slot="capture-target"
        >
          <div className="flex flex-col p-px [contain-intrinsic-size:380px_1200px] [content-visibility:auto]">
            <StyleOverview />
            <TypographySpecimen />
            <div className="md:hidden">
              <UIElements />
            </div>
            <CodespacesCard />
            <Invoice />
          </div>
          <div className="flex flex-col p-px [contain-intrinsic-size:380px_1200px] [content-visibility:auto]">
            <IconPreviewGrid />
            <div className="hidden w-full md:flex">
              <UIElements />
            </div>
            <ObservabilityCard />
            <ShippingAddress />
          </div>
          <div className="flex flex-col p-px [contain-intrinsic-size:380px_1200px] [content-visibility:auto]">
            <EnvironmentVariables />
            <BarChartCard />
            <InviteTeam />
            <ActivateAgentDialog />
          </div>
          <div className="flex flex-col p-px [contain-intrinsic-size:380px_1200px] [content-visibility:auto]">
            <SkeletonLoading />
            <PieChartCard />
            <NoTeamMembers />
            <ReportBug />
            <Contributors />
          </div>
          <div className="flex flex-col p-px [contain-intrinsic-size:380px_1200px] [content-visibility:auto]">
            <FeedbackForm />
            <BookAppointment />
            <SleepReport />
            <GithubProfile />
          </div>
          <div className="flex flex-col p-px [contain-intrinsic-size:380px_1200px] [content-visibility:auto]">
            <WeeklyFitnessSummary />
            <FileUpload />
            <AnalyticsCard />
            <UsageCard />
            <Shortcuts />
          </div>
          <div className="flex flex-col p-px [contain-intrinsic-size:380px_1200px] [content-visibility:auto]">
            <AnomalyAlert />
            <LiveWaveformCard />
            <Visitors />
            <ContributionsActivity />
            <NotFound />
          </div>
        </div>
      </div>
    </div>
  )
}
