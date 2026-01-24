import { Activity, CheckCircle, XCircle, Clock } from 'lucide-react'
import { ScoreTrendChart } from '@/components/charts/score-trend'
import { RecentRuns } from '@/components/dashboard/recent-runs'

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Overview of your agent evaluations</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          title="Total Runs"
          value="156"
          icon={<Activity className="w-5 h-5 text-primary-600" />}
          trend="+12 this week"
        />
        <StatCard
          title="Passed"
          value="142"
          icon={<CheckCircle className="w-5 h-5 text-green-600" />}
          trend="91% pass rate"
        />
        <StatCard
          title="Failed"
          value="14"
          icon={<XCircle className="w-5 h-5 text-red-600" />}
          trend="9% failure rate"
        />
        <StatCard
          title="Avg Score"
          value="0.84"
          icon={<Clock className="w-5 h-5 text-yellow-600" />}
          trend="+0.02 vs last week"
        />
      </div>

      {/* Score Trend Chart */}
      <div className="card">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Score Trend</h2>
          <p className="text-sm text-gray-500 mt-1">
            Average evaluation scores over the last 7 days
          </p>
        </div>
        <div className="p-6">
          <ScoreTrendChart days={7} threshold={0.7} />
        </div>
      </div>

      {/* Recent Runs */}
      <RecentRuns limit={10} />
    </div>
  )
}

function StatCard({
  title,
  value,
  icon,
  trend,
}: {
  title: string
  value: string
  icon: React.ReactNode
  trend: string
}) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{title}</span>
        {icon}
      </div>
      <div className="mt-2">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
      </div>
      <div className="mt-1">
        <span className="text-sm text-gray-500">{trend}</span>
      </div>
    </div>
  )
}
