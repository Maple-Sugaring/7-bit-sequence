//SWITCHING THIS TO THE NEW SCHEDULE PAGE
import { PageHeader } from "../components/common/PageHeader";
import { StudentScheduleView } from "../components/schedule/StudentScheduleView";

export function SchedulePage() {
  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle="Claim a collection shift and connect your Google Calendar so claimed times land on your calendar"
      />

      <StudentScheduleView />
    </>
  );
}
