'use client'

import { useId, useState } from 'react'
import { Users } from 'lucide-react'
import { DashboardCard } from './DashboardCard'
import { SegmentedControl } from './SegmentedControl'
import { WorkloadList } from './WorkloadList'
import { CasesByAreaChart } from './CasesByAreaChart'

type TeamTab = 'pessoas' | 'areas'

const TABS = [
  { value: 'pessoas', label: 'Pessoas' },
  { value: 'areas', label: 'Áreas' },
] as const

interface TeamCardProps {
  className?: string
}

/**
 * Who carries what — cases and tasks per person — and, in the second tab, the
 * cases per legal area. Two cards that were side by side became one: both
 * answer "how is the work spread", one by person and one by area.
 *
 * Only the open tab is mounted, so the areas query waits for the click.
 */
export function TeamCard({ className }: TeamCardProps) {
  const id = useId()
  const [tab, setTab] = useState<TeamTab>('pessoas')

  return (
    <DashboardCard
      icon={Users}
      tone="violet"
      title="Equipe"
      action={
        <SegmentedControl
          kind="tabs"
          id={id}
          label="Ver por"
          options={TABS}
          value={tab}
          onChange={setTab}
        />
      }
      className={className}
      bodyClassName="px-4 pb-4"
    >
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
        {tab === 'pessoas' ? <WorkloadList /> : <CasesByAreaChart />}
      </div>
    </DashboardCard>
  )
}
