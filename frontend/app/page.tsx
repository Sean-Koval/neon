import { Activity, CheckCircle, Clock, XCircle } from 'lucide-react'

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

      {/* Recent Runs */}
      <div className="card">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Recent Runs</h2>
        </div>
        <div className="divide-y divide-gray-200">
          <RunRow
            suite="core-tests"
            version="abc123"
            status="completed"
            passed={8}
            total={10}
            score={0.82}
            time="2 min ago"
          />
          <RunRow
            suite="regression-suite"
            version="def456"
            status="completed"
            passed={15}
            total={15}
            score={0.95}
            time="1 hour ago"
          />
          <RunRow
            suite="core-tests"
            version="ghi789"
            status="running"
            passed={5}
            total={10}
            score={0.78}
            time="Just now"
          />
        </div>
        <div className="p-4 text-center">
          <a
            href="/runs"
            className="text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            View all runs
          </a>
        </div>
      </div>
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

function RunRow({
  suite,
  version,
  status,
  passed,
  total,
  score,
  time,
}: {
  suite: string
  version: string
  status: string
  passed: number
  total: number
  score: number
  time: string
}) {
  const statusColors = {
    completed: 'badge-green',
    running: 'badge-yellow',
    failed: 'badge-red',
    pending: 'badge-gray',
  }

  return (
    <div className="p-4 flex items-center justify-between hover:bg-gray-50">
      <div className="flex items-center space-x-4">
        <div>
          <p className="font-medium text-gray-900">{suite}</p>
          <p className="text-sm text-gray-500">Version: {version}</p>
        </div>
      </div>
      <div className="flex items-center space-x-6">
        <span
          className={`badge ${statusColors[status as keyof typeof statusColors] || 'badge-gray'}`}
        >
          {status}
        </span>
        <div className="text-right">
          <p className="font-medium text-gray-900">
            {passed}/{total} passed
          </p>
          <p className="text-sm text-gray-500">Score: {score.toFixed(2)}</p>
        </div>
        <span className="text-sm text-gray-500 w-20 text-right">{time}</span>
      </div>
    </div>
  )
}
