import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { QueuedQuestion } from '../types/interview';

interface DashboardWidgetProps {
  questions: QueuedQuestion[];
}

export const DashboardWidget: React.FC<DashboardWidgetProps> = ({ questions }) => {
  const topTopics = useMemo(() => {
    const counts: Record<string, number> = {};
    questions.forEach((q) => {
      if (q.category) {
        counts[q.category] = (counts[q.category] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));
  }, [questions]);

  if (topTopics.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900 mb-4">Topic Breakdown (Top 3)</h3>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={topTopics} layout="vertical" margin={{ left: 0, right: 20 }}>
            <XAxis type="number" hide />
            <YAxis
              dataKey="name"
              type="category"
              width={80}
              tick={{ fontSize: 10, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: 'transparent' }}
              contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {topTopics.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === 0 ? '#0891b2' : index === 1 ? '#0ea5e9' : '#38bdf8'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
