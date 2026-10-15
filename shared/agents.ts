export const agentDefaults = {
  detector: 'liquid/lfm-2.5-2.6b:free',
  coach: 'google/gemma-4-31b-it:free',
  specialist: 'nvidia/nemotron-3-super-120b-a12b:free',
  reviewer: 'nvidia/nemotron-3.5-super-vl:free',
  fallback: 'openrouter/free',
};
export type AgentPlan = typeof agentDefaults;

export function needsSpecialist(task: string, question: string) {
  if (['technical', 'coding', 'system_design', 'case'].includes(task)) return true;
  return (
    task === 'auto' &&
    /\b(?:code|algorithm|sql|database|system design|distributed|complexity|debug|architecture)\b|โค้ด|อัลกอริทึม|ฐานข้อมูล|ออกแบบระบบ|แก้บั๊ก/i.test(
      question,
    )
  );
}
