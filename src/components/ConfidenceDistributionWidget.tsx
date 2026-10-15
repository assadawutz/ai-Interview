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

interface ConfidenceDistributionWidgetProps {
  questions: QueuedQuestion[];
}

export const ConfidenceDistributionWidget: React.FC<ConfidenceDistributionWidgetProps> = ({ questions }) => {
  const data = useMemo(() => {
    const bins = [
      { range: '0-20%', count: 0 },
      { range: '21-40%', count: 0 },
      { range: '41-60%', count: 0 },
      { range: '61-80%', count: 0 },
      { range: '81-100%', count: 0 },
    ];

    questions.forEach((q) => {
      const confidence = q.confidence || 0;
      if (confidence <= 20) bins[0].count++;
      else if (confidence <= 40) bins[1].count++;
      else if (confidence <= 60) bins[2].count++;
      else if (confidence <= 80) bins[3].count++;
      else bins[4].count++;
    });

    return bins;
  }, [questions]);

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-950 mb-4">Confidence Distribution</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="range" fontSize={12} />
            <YAxis fontSize={12} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#0891B2" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={index < 2 ? '#EF4444' : index === 2 ? '#F59E0B' : '#10B981'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
